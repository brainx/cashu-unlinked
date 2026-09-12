import type { ScenarioKind } from "../../src/contracts.js";

export const acts: readonly {
  kind: ScenarioKind;
  numeral: string;
  label: string;
  title: string;
  description: string;
  mechanism: string;
}[] = [
  {
    kind: "account-ledger",
    numeral: "I",
    label: "The visible trail",
    title: "Every trail starts with a clue.",
    description:
      "Twelve issuance records. One spent proof. Compare their visible serials to find the matching record.",
    mechanism: "A shared serial leaves a trail",
  },
  {
    kind: "cashu-blind",
    numeral: "II",
    label: "Blind issuance",
    title: "The trail ends. The money moves.",
    description:
      "All twelve issuances have the same denomination. Without a shared serial, can these observations identify one source?",
    mechanism: "No shared serial in these observations",
  },
  {
    kind: "cashu-denomination",
    numeral: "III",
    label: "The metadata clue",
    title: "Same cryptography. Different clues.",
    description:
      "The serial link is hidden, but the denominations are visible. Compare each record with the spent proof.",
    mechanism: "Blindness does not hide denomination",
  },
];

export const issuanceLabel = (index: number): string =>
  `Issuance ${String(index + 1).padStart(2, "0")}`;
export const timestamp = (milliseconds: number): string =>
  `+${(milliseconds / 1000).toFixed(3)}s`;
