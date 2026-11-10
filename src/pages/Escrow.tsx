import { useState } from 'react'
import { useNow } from '@/hooks/useNow'
import { useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { erc20Abi, keccak256, toBytes, zeroAddress, type Address } from 'viem'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { CHAIN_ID, ESCROW_ADDRESS, USDC_ADDRESS, addressUrl, publicClient } from '@/lib/chain'
import { escrowAbi } from '@/contracts/escrowAbi'
import { fmtDate, fmtUsdc, isValidAddress, parseAmountInput, parseTxError, shortAddr } from '@/lib/format'
import { same } from '@/lib/invoice'
import { usePersisted } from '@/lib/store'
import { useFlowFi } from '@/state'
import { useEnsureChain } from '@/hooks/useChainWrite'
import { Card, EmptyState, Field, Modal, Notice, PageHeader, Spinner, StatusBadge, TxLink } from '@/components/ui'
import type { EscrowTerms } from '@/lib/types'

const NO_TERMS: EscrowTerms[] = []
const STATUS = ['none', 'funded', 'released', 'refunded'] as const
const MAX_SHOWN = 30

function dateInput(daysAhead: number) {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10)
}

function CreateEscrow({ onDone }: { onDone: () => void }) {
  const { address, balance, recordTx, notify } = useFlowFi()
  const ensure = useEnsureChain()
  const { writeContractAsync } = useWriteContract()
  const nowMs = useNow()
  const [, setTerms] = usePersisted<EscrowTerms[]>(address, 'escrow-terms', NO_TERMS)
  const [payee, setPayee] = useState('')
  const [arbiter, setArbiter] = useState('')
  const [amount, setAmount] = useState('')
  const [deadline, setDeadline] = useState(dateInput(14))
  const [terms, setTermsText] = useState('')
  const [step, setStep] = useState<'idle' | 'approving' | 'creating'>('idle')

  const parsed = parseAmountInput(amount, balance)
  const payeeErr = !payee ? null : !isValidAddress(payee) ? 'Enter a valid 0x address' : same(payee, address) ? 'Payee cannot be you' : same(payee, USDC_ADDRESS) || same(payee, ESCROW_ADDRESS) ? 'That address cannot receive escrow funds' : null
  const arbErr = !arbiter ? null : !isValidAddress(arbiter) ? 'Enter a valid 0x address' : same(arbiter, address) || same(arbiter, payee) ? 'Referee must be a third party' : null
  const dlTs = Math.floor(new Date(`${deadline}T23:59:59`).getTime() / 1000)
  const now = Math.floor(nowMs / 1000)
  const dlOk = dlTs > now + 3600 && dlTs < now + 364 * 86400
  const ready = !!address && !!ESCROW_ADDRESS && isValidAddress(payee) && !payeeErr && !arbErr && parsed.ok && dlOk && terms.trim().length >= 5 && step === 'idle'

  const submit = async () => {
    if (!address || !ESCROW_ADDRESS || !parsed.ok) return
    try {
      await ensure()
      const allowance = await publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [address, ESCROW_ADDRESS] })
      if (allowance < parsed.raw) {
        setStep('approving')
        const h = await writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ESCROW_ADDRESS, parsed.raw], chainId: CHAIN_ID })
        const r = await publicClient.waitForTransactionReceipt({ hash: h })
        if (r.status !== 'success') throw new Error('reverted')
      }
      setStep('creating')
      const termsHash = keccak256(toBytes(terms.trim()))
      const hash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: 'createEscrow',
        args: [payee.trim() as Address, (arbiter.trim() || zeroAddress) as Address, parsed.raw, BigInt(dlTs), termsHash],
        chainId: CHAIN_ID,
      })
      setTerms((p) => [{ hash: termsHash, text: terms.trim() }, ...p.filter((t) => t.hash !== termsHash)])
      recordTx({ hash, to: payee.trim() as Address, amount: parsed.raw.toString(), note: 'Escrow created', createdAt: Date.now(), status: 'pending', kind: 'escrow' })
      const r = await publicClient.waitForTransactionReceipt({ hash })
      if (r.status !== 'success') throw new Error('reverted')
      notify({ kind: 'escrow', title: 'Escrow funded', body: `${fmtUsdc(parsed.raw)} USDC is now held for ${shortAddr(payee)}.` })
      onDone()
    } catch (e) {
      const msg = parseTxError(e)
      if (msg) toast.error(msg)
    } finally {
      setStep('idle')
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Payee wallet" error={payeeErr}><input className="input font-mono" placeholder="0x…" value={payee} onChange={(e) => setPayee(e.target.value)} spellCheck={false} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (USDC)" error={amount && !parsed.ok ? parsed.error : null}><input className="input num" inputMode="decimal" placeholder="500.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reclaim deadline" error={deadline && !dlOk ? 'Between 1 hour and 364 days from now' : null}><input type="date" className="input" min={dateInput(1)} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      </div>
      <Field label="Referee wallet (optional)" error={arbErr} hint="A neutral party who can release or refund if you and the payee disagree."><input className="input font-mono" placeholder="0x…" value={arbiter} onChange={(e) => setArbiter(e.target.value)} spellCheck={false} /></Field>
      <Field label="Release conditions" hint="Describe what must be delivered. A fingerprint of this text is stored onchain; the text stays on this device."><textarea className="input min-h-[88px] py-3" maxLength={400} placeholder="Release when the final logo files are delivered." value={terms} onChange={(e) => setTermsText(e.target.value)} /></Field>
      <Notice>You can release the funds at any time. The payee can refund you at any time. After the deadline you can reclaim the funds yourself. A referee, if set, can do either.</Notice>
      <button className="btn-primary w-full" disabled={!ready} onClick={() => void submit()}>
        {step === 'approving' ? (<><Spinner /> Approve USDC in your wallet</>) : step === 'creating' ? (<><Spinner /> Create escrow in your wallet</>) : 'Fund escrow'}
      </button>
    </div>
  )
}

export function Escrow() {
  const { address, isConnected, recordTx, txNotes } = useFlowFi()
  const ensure = useEnsureChain()
  const { writeContractAsync } = useWriteContract()
  const nowMs = useNow()
  const [terms] = usePersisted<EscrowTerms[]>(address, 'escrow-terms', NO_TERMS)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const ids = useReadContract({ address: ESCROW_ADDRESS, abi: escrowAbi, functionName: 'escrowIdsOf', args: address ? [address] : undefined, chainId: CHAIN_ID, query: { enabled: !!ESCROW_ADDRESS && !!address, refetchInterval: 8000 } })
  const idList = [...(ids.data ?? [])].reverse().slice(0, MAX_SHOWN)
  const list = useReadContracts({
    contracts: idList.map((id) => ({ address: ESCROW_ADDRESS!, abi: escrowAbi, functionName: 'getEscrow' as const, args: [id] as const, chainId: CHAIN_ID })),
    query: { enabled: idList.length > 0 && !!ESCROW_ADDRESS, refetchInterval: 8000 },
  })

  const act = async (id: bigint, fn: 'release' | 'refund', to: Address, amount: bigint) => {
    if (!ESCROW_ADDRESS) return
    setBusy(`${fn}${id}`)
    try {
      await ensure()
      const hash = await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowAbi, functionName: fn, args: [id], chainId: CHAIN_ID })
      recordTx({ hash, to, amount: amount.toString(), note: `Escrow #${id} ${fn}`, createdAt: Date.now(), status: 'pending', kind: 'escrow' })
      const r = await publicClient.waitForTransactionReceipt({ hash })
      if (r.status !== 'success') throw new Error('reverted')
      toast.success(fn === 'release' ? 'Funds released to the payee' : 'Funds refunded to the payer')
      await Promise.all([ids.refetch(), list.refetch()])
    } catch (e) {
      const msg = parseTxError(e)
      if (msg) toast.error(msg)
    } finally {
      setBusy(null)
    }
  }

  const history = txNotes.filter((n) => n.kind === 'escrow')

  return (
    <>
      <PageHeader
        title="Escrow"
        subtitle="Hold USDC in a smart contract until the agreed conditions are met. Funds move only by the rules below."
        action={<button className="btn-primary" disabled={!isConnected || !ESCROW_ADDRESS} onClick={() => setCreating(true)}>New escrow</button>}
      />
      {!ESCROW_ADDRESS && <Notice tone="warn">Escrow needs its contract address (VITE_FLOWFI_ESCROW). Deploy FlowFiEscrow and set it in .env.</Notice>}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {idList.length === 0 ? (
            <Card><EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No escrow agreements" body={isConnected ? 'Create an agreement to hold payment until work is delivered.' : 'Connect your wallet to see and create escrow agreements.'} /></Card>
          ) : (
            idList.map((id, idx) => {
              const e = list.data?.[idx]?.result
              if (!e) return <Card key={String(id)} className="card-pad"><Spinner /></Card>
              const status = STATUS[e.status] ?? 'none'
              const isPayer = same(e.payer, address)
              const isPayee = same(e.payee, address)
              const isArb = same(e.arbiter, address)
              const deadlinePassed = nowMs / 1000 >= Number(e.deadline)
              const canRelease = status === 'funded' && (isPayer || isArb)
              const canRefund = status === 'funded' && (isPayee || isArb || (isPayer && deadlinePassed))
              const text = terms.find((t) => t.hash === e.termsHash)?.text
              return (
                <Card key={String(id)} className="card-pad">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="kicker">Escrow #{String(id)} · you are the {isPayer ? 'payer' : isPayee ? 'payee' : 'referee'}</p>
                      <p className="num mt-1 font-display text-2xl font-semibold">{fmtUsdc(e.amount)} <span className="text-sm text-muted">USDC</span></p>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                  <div className="inset mt-4 divide-y divide-line/40 text-sm">
                    <div className="flex justify-between px-3.5 py-2"><span className="text-muted">Payer</span><span className="font-mono text-xs">{shortAddr(e.payer)}</span></div>
                    <div className="flex justify-between px-3.5 py-2"><span className="text-muted">Payee</span><span className="font-mono text-xs">{shortAddr(e.payee)}</span></div>
                    {e.arbiter !== zeroAddress && <div className="flex justify-between px-3.5 py-2"><span className="text-muted">Referee</span><span className="font-mono text-xs">{shortAddr(e.arbiter)}</span></div>}
                    <div className="flex justify-between px-3.5 py-2"><span className="text-muted">Payer can reclaim after</span><span>{fmtDate(Number(e.deadline) * 1000)}</span></div>
                    <div className="px-3.5 py-2"><span className="text-muted">Conditions: </span>{text ?? <span className="font-mono text-xs text-muted">hash {shortAddr(e.termsHash, 10, 6)} (text kept by the creator)</span>}</div>
                  </div>
                  {status === 'funded' && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {canRelease && <button className="btn-primary" disabled={!!busy} onClick={() => void act(id, 'release', e.payee, e.amount)}>{busy === `release${id}` ? <Spinner /> : 'Release to payee'}</button>}
                      {canRefund && <button className="btn-ghost" disabled={!!busy} onClick={() => void act(id, 'refund', e.payer, e.amount)}>{busy === `refund${id}` ? <Spinner /> : 'Refund to payer'}</button>}
                      {!canRelease && !canRefund && <p className="text-xs text-muted">Waiting on the payer or referee to release, or on the deadline for the payer to reclaim.</p>}
                    </div>
                  )}
                </Card>
              )
            })
          )}
        </div>
        <Card className="card-pad h-fit">
          <h2 className="font-display text-base font-semibold">Escrow activity</h2>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Transactions you send from this page are listed here.</p>
          ) : (
            <div className="mt-2 divide-y divide-line/40">
              {history.slice(0, 10).map((n) => (
                <div key={n.hash} className="flex items-center justify-between gap-2 py-2.5">
                  <div><p className="text-sm">{n.note}</p><TxLink hash={n.hash} /></div>
                  <StatusBadge status={n.status} />
                </div>
              ))}
            </div>
          )}
          {ESCROW_ADDRESS && <a className="mt-3 block text-xs text-accent hover:underline" href={addressUrl(ESCROW_ADDRESS)} target="_blank" rel="noopener noreferrer">View contract on the explorer</a>}
        </Card>
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="New escrow agreement">
        <CreateEscrow onDone={() => { setCreating(false); void ids.refetch(); void list.refetch() }} />
      </Modal>
    </>
  )
}
