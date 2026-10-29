import type { ListRow } from "../whatsapp/client";

export interface Button {
  id: string;
  /** Max 20 characters. */
  title: string;
}

/** One message from Sika: text plus at most one kind of control. */
export interface Ui {
  text: string;
  /** Up to 3 reply buttons. */
  buttons?: Button[];
  /** A single button that opens a list of up to 10 rows. */
  list?: { button: string; rows: ListRow[] };
}

export const STEP = (n: 1 | 2 | 3, name: string) => `_Step ${n} of 3 · ${name}_`;
