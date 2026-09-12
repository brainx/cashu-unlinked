export type CashuStep = {
  label: string;
  title: string;
  explanation: string;
  takeaway: string;
  wallet: string;
  mint: string;
  source: {label: string; url: string};
};

// General protocol teaching material, independent of the current investigation.
export const cashuSteps: readonly CashuStep[] = [
  {
    label: 'Bitcoin in',
    title: 'The bitcoin stays with the mint.',
    explanation: 'Cashu is an ecash protocol. In this Lightning example, your wallet gets a payment quote from a mint. Once the invoice is paid, the mint can issue ecash. Your wallet holds the resulting proofs; the mint holds the backing bitcoin and must honor redemption.',
    takeaway: 'An ecash proof is a claim on its issuing mint. Holding it is different from holding bitcoin keys.',
    wallet: 'The wallet knows its payment quote and requests ecash once payment is confirmed. A token can contain several proofs with different values.',
    mint: 'The mint sees the incoming payment and quote. It controls the backing funds. A valid signature proves issuance, not that those funds are still available.',
    source: {label: 'NUT-04 · Minting', url: 'https://cashubtc.github.io/nuts/04/'},
  },
  {
    label: 'Blind',
    title: 'Hide the secret. Keep the value visible.',
    explanation: 'Your wallet chooses a fresh random secret for each proof. It turns that secret into a blinded message using private randomness. The mint receives this disguised message together with the requested denomination and keyset. Blinding does not hide the amount.',
    takeaway: 'The denomination is public. The secret and blinding factor stay in the wallet during issuance.',
    wallet: 'The wallet knows the original secret and the blinding factor. Both stay local during issuance. The symbols here are illustrations, never usable token data.',
    mint: 'The mint sees a blinded message, denomination, and keyset. It does not receive the original secret or the wallet’s blinding factor at this stage.',
    source: {label: 'NUT-00 · Blind signatures', url: 'https://cashubtc.github.io/nuts/00/'},
  },
  {
    label: 'Sign',
    title: 'A signature without a visible serial link.',
    explanation: 'The mint signs the blinded message. Your wallet removes the blinding locally, leaving a valid signature on the original secret. When that proof comes back later, the mint can check it without a direct cryptographic match to the blinded request it signed.',
    takeaway: 'The signature stays valid. The direct issuance-to-spend link does not survive unblinding.',
    wallet: 'The wallet now holds a spendable proof: a secret, a signature, a value, and a keyset identifier. It can package one or more proofs into a token.',
    mint: 'The mint knows which blinded messages it signed together. It does not see the locally unblinded result until a proof is presented later. Metadata can still suggest a connection.',
    source: {label: 'NUT-04 · Unblinding signatures', url: 'https://cashubtc.github.io/nuts/04/#unblinding-signatures'},
  },
  {
    label: 'Send',
    title: 'Send the token, not a ledger entry.',
    explanation: 'You can hand the token to someone else, for example through a QR code or a private message. That handoff itself does not need a mint request. For an ordinary unlocked token, anyone with its proofs can try to spend it—including a sender who kept a copy.',
    takeaway: 'The sender may have kept a copy. The recipient needs a successful swap before relying on the payment.',
    wallet: 'The recipient receives the proof data directly. The transfer channel may expose information independently of the mint.',
    mint: 'The mint does not automatically receive a notification of this peer-to-peer handoff. Sending wallets may contact it first to prepare exact change.',
    source: {label: 'NUT-00 · Token format and transfer', url: 'https://cashubtc.github.io/nuts/00/#serialization-of-tokens'},
  },
  {
    label: 'Refresh',
    title: 'New proofs. Old copies stop working.',
    explanation: 'The recipient sends the received proofs to their issuing mint along with fresh blinded requests. The mint checks validity and that the inputs are unspent, consumes them, and signs replacements. After a successful swap, the sender’s old copy cannot be spent again.',
    takeaway: 'A signature check alone cannot detect an already-spent copy. Refresh with the mint; input fees can reduce the returned value.',
    wallet: 'The recipient’s wallet unblinds the replacements using its own randomness. The sender does not know these new secrets. Receipt is complete only after the swap succeeds.',
    mint: 'The mint sees the old proofs and fresh blinded outputs in the same swap request. It can group that request, but cannot directly match a replacement’s later unblinded spend to its earlier blinded output.',
    source: {label: 'NUT-03 · Swapping', url: 'https://cashubtc.github.io/nuts/03/'},
  },
  {
    label: 'Bitcoin out',
    title: 'Redeem the promise.',
    explanation: 'To pay out over Lightning, the wallet asks for a melt quote, then supplies enough ecash for the invoice and fees. The mint pays using its Lightning funds and consumes the proofs on success. A pending payment still needs its final result checked.',
    takeaway: 'Redemption depends on the mint being available, solvent, and willing to pay. Blinding does not remove that trust.',
    wallet: 'The wallet tracks payment status and any fee change. Cashu also supports other payment methods; Lightning is the route illustrated here.',
    mint: 'The mint sees the outgoing invoice, submitted proofs, and payment amount. It learns about the outgoing payment even though blinding prevents a direct cryptographic link to earlier issuance.',
    source: {label: 'NUT-05 · Melting', url: 'https://cashubtc.github.io/nuts/05/'},
  },
];

export const cashuQuestions = [
  {title: 'Is Cashu a blockchain or a new coin?', answer: 'Cashu has no blockchain or coin of its own. It defines how wallets and mints exchange ecash. In this example, values are denominated in satoshis and redemption uses Lightning.'},
  {title: 'Does “private” mean the mint sees nothing?', answer: 'No. Amounts, keysets, request grouping, timing, network addresses, and payment invoices can provide clues. Blind signatures remove a direct cryptographic link; they do not erase surrounding information or prove who owns a proof.'},
  {title: 'Can another mint redeem these proofs?', answer: 'A mint redeems proofs signed with its own keys. Moving value to another mint requires an exchange, such as a Lightning payment.'},
  {title: 'What if the mint disappears?', answer: 'You depend on its ability and willingness to redeem. A backup of your wallet cannot recover backing funds from an insolvent or unavailable mint. Someone who obtains an ordinary unlocked token can spend it; loss and recovery also depend on the wallet and its backup scheme.'},
] as const;
