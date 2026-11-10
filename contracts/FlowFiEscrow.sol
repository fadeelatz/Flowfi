// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FlowFiEscrow
/// @notice Fee-free USDC escrows with optional arbitration and mandatory refund deadlines.
/// Every escrow has a deadline at most 365 days away, at or after which the payer can reclaim funds.
/// @dev Uses ERC-20 USDC, not native gas-token transfers. No administrative privileges.
contract FlowFiEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Escrow {
        address payer;
        address payee;
        address arbiter;
        uint64 deadline;
        uint64 createdAt;
        Status status;
        uint256 amount;
        bytes32 termsHash;
    }

    /// @notice The ERC-20 USDC token used for all escrow payments.
    IERC20 public immutable usdc;

    uint256 private _escrowCount;
    mapping(uint256 => Escrow) private _escrows;
    mapping(address => uint256[]) private _escrowIds;

    error ZeroTokenAddress();
    error InvalidPayee();
    error ZeroAmount();
    error InvalidDeadline();
    error InvalidArbiter();
    error UnexpectedBalanceDelta(uint256 expected, uint256 balanceBefore, uint256 balanceAfter);
    error EscrowNotFound(uint256 id);
    error EscrowNotFunded(uint256 id);
    error Unauthorized(uint256 id, address caller);

    /// @notice Emitted when a payer funds a new escrow.
    /// @param id The newly allocated escrow identifier.
    /// @param payer The account funding the escrow.
    /// @param payee The account designated to receive released funds.
    /// @param arbiter The optional arbiter, or zero if none.
    /// @param amount The funded amount in USDC base units (6 decimals).
    /// @param deadline The mandatory payer refund timestamp.
    /// @param termsHash The hash identifying the agreed off-chain terms.
    event EscrowCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        address arbiter,
        uint256 amount,
        uint64 deadline,
        bytes32 termsHash
    );

    /// @notice Emitted when escrow funds are released to the payee.
    /// @param id The released escrow identifier.
    /// @param by The payer or arbiter authorizing release.
    event EscrowReleased(uint256 indexed id, address indexed by);

    /// @notice Emitted when escrow funds are returned to the payer.
    /// @param id The refunded escrow identifier.
    /// @param by The authorized account requesting the refund.
    event EscrowRefunded(uint256 indexed id, address indexed by);

    /// @notice Sets the immutable ERC-20 USDC token for this escrow contract.
    /// @param usdc_ The nonzero token address; Arc Testnet USDC is
    /// 0x3600000000000000000000000000000000000000.
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroTokenAddress();
        usdc = IERC20(usdc_);
    }

    /// @notice Creates and funds an escrow using the caller's prior USDC allowance.
    /// @dev Requires a future deadline at most 365 days away, at or after which the payer can reclaim funds.
    /// The payee and any nonzero arbiter must not be this contract, the USDC token,
    /// or an address at or below 0xFFFF.
    /// @param payee The nonzero recipient, distinct from the caller.
    /// @param arbiter An optional third party, distinct from both participants.
    /// @param amount The positive amount in USDC base units (6 decimals).
    /// @param deadline A mandatory future payer refund timestamp no more than 365 days away.
    /// @param termsHash The hash identifying the agreed off-chain terms.
    /// @return id The new sequential escrow identifier, starting at one.
    function createEscrow(
        address payee,
        address arbiter,
        uint256 amount,
        uint64 deadline,
        bytes32 termsHash
    ) external nonReentrant returns (uint256 id) {
        if (
            uint160(payee) <= 0xFFFF || payee == msg.sender
                || payee == address(this) || payee == address(usdc)
        ) revert InvalidPayee();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp || deadline > block.timestamp + 365 days) revert InvalidDeadline();
        if (
            arbiter != address(0)
                && (arbiter == msg.sender || arbiter == payee || arbiter == address(this)
                    || arbiter == address(usdc) || uint160(arbiter) <= 0xFFFF)
        ) {
            revert InvalidArbiter();
        }

        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = usdc.balanceOf(address(this));
        if (balanceAfter < balanceBefore || balanceAfter - balanceBefore != amount) {
            revert UnexpectedBalanceDelta(amount, balanceBefore, balanceAfter);
        }

        id = ++_escrowCount;
        _escrows[id] = Escrow({
            payer: msg.sender,
            payee: payee,
            arbiter: arbiter,
            deadline: deadline,
            createdAt: uint64(block.timestamp),
            status: Status.Funded,
            amount: amount,
            termsHash: termsHash
        });

        // Validation ensures every nonzero participant is distinct.
        _escrowIds[msg.sender].push(id);
        _escrowIds[payee].push(id);
        if (arbiter != address(0)) _escrowIds[arbiter].push(id);

        emit EscrowCreated(id, msg.sender, payee, arbiter, amount, deadline, termsHash);
    }

    /// @notice Releases a funded escrow to its payee, regardless of its deadline.
    /// @dev Only the payer or the designated arbiter may authorize release.
    /// @param id The escrow identifier.
    function release(uint256 id) external nonReentrant {
        Escrow storage escrow = _existingEscrow(id);
        if (escrow.status != Status.Funded) revert EscrowNotFunded(id);
        if (msg.sender != escrow.payer && msg.sender != escrow.arbiter) {
            revert Unauthorized(id, msg.sender);
        }

        escrow.status = Status.Released;
        usdc.safeTransfer(escrow.payee, escrow.amount);
        emit EscrowReleased(id, msg.sender);
    }

    /// @notice Returns a funded escrow's USDC to its payer.
    /// @dev The payee or arbiter may refund at any time. Every escrow has a mandatory
    /// deadline at most 365 days after creation; the payer may reclaim at or after it.
    /// @param id The escrow identifier.
    function refund(uint256 id) external nonReentrant {
        Escrow storage escrow = _existingEscrow(id);
        if (escrow.status != Status.Funded) revert EscrowNotFunded(id);
        bool payerMayRefund = msg.sender == escrow.payer
            && escrow.deadline != 0 && block.timestamp >= escrow.deadline;
        if (msg.sender != escrow.payee && msg.sender != escrow.arbiter && !payerMayRefund) {
            revert Unauthorized(id, msg.sender);
        }

        escrow.status = Status.Refunded;
        usdc.safeTransfer(escrow.payer, escrow.amount);
        emit EscrowRefunded(id, msg.sender);
    }

    /// @notice Returns the complete record of an existing escrow.
    /// @param id The escrow identifier.
    /// @return escrow The escrow record; nonexistent identifiers revert.
    function getEscrow(uint256 id) external view returns (Escrow memory escrow) {
        escrow = _existingEscrow(id);
    }

    /// @notice Returns the total number of escrows created, including settled ones.
    /// @return count The number of escrows created.
    function escrowCount() external view returns (uint256 count) {
        return _escrowCount;
    }

    /// @notice Returns all escrow identifiers involving an account, in creation order.
    /// @param account The payer, payee, or arbiter to look up.
    /// @return ids Each associated escrow identifier exactly once.
    function escrowIdsOf(address account) external view returns (uint256[] memory ids) {
        return _escrowIds[account];
    }

    function _existingEscrow(uint256 id) private view returns (Escrow storage escrow) {
        escrow = _escrows[id];
        if (escrow.status == Status.None) revert EscrowNotFound(id);
    }
}
