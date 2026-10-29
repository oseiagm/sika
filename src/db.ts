import { Mandate } from "./mandate/schema";
import type { Charges } from "./fees/engine";
import type { Side } from "./fees/schedule";
import type { Verdict } from "./policy/check";
import type { FlowState } from "./flow/state";
import type { ProfileState } from "./profile/conversation";
import type { Tape } from "./market/quotes";
import type { Holding, HoldingInput } from "./portfolio/holdings";

export type IntentStatus = "PROPOSED" | "APPROVED" | "REJECTED" | "EXPIRED" | "FILLED" | "FAILED";

export interface Intent {
  id: string;
  waId: string;
  side: Side;
  symbol: string;
  shares: bigint;
  price: bigint;
  net: bigint;
  rationale: string;
  verdict: Verdict;
  signature: string;
  status: IntentStatus;
  expiresAt: string;
}

interface IntentRow {
  id: string;
  wa_id: string;
  side: Side;
  symbol: string;
  shares: number;
  price_pesewas: number;
  net_pesewas: number;
  rationale: string;
  verdict_json: string;
  signature: string;
  status: IntentStatus;
  expires_at: string;
}

export interface FillRecord {
  intentId: string;
  waId: string;
  side: Side;
  symbol: string;
  shares: bigint;
  price: bigint;
  charges: Charges;
}

const bigintJson = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

export interface User {
  waId: string;
  name: string | null;
  mandate: Mandate | null;
  mandateConfirmed: boolean;
  holdingsDraft: HoldingInput[] | null;
  /** Risk-profile questions: in progress, finished (done set), or never started (null). */
  profile: ProfileState | null;
  flow: FlowState | null;
}

interface UserRow {
  wa_id: string;
  name: string | null;
  mandate_json: string | null;
  mandate_confirmed_at: string | null;
  holdings_draft_json: string | null;
  profile_json: string | null;
  flow_json: string | null;
}

export class Db {
  constructor(private readonly d1: D1Database) {}

  /** Records the message id; false if it was already handled (WhatsApp redelivers). */
  async firstDelivery(messageId: string): Promise<boolean> {
    const r = await this.d1.prepare("INSERT OR IGNORE INTO processed (message_id) VALUES (?)").bind(messageId).run();
    return r.meta.changes === 1;
  }

  async user(waId: string, name?: string): Promise<User> {
    await this.d1
      .prepare("INSERT INTO users (wa_id, name) VALUES (?, ?) ON CONFLICT (wa_id) DO UPDATE SET name = COALESCE(excluded.name, users.name)")
      .bind(waId, name ?? null)
      .run();
    const row = await this.d1.prepare("SELECT * FROM users WHERE wa_id = ?").bind(waId).first<UserRow>();
    if (!row) throw new Error("user row missing after upsert");
    const parsed = row.mandate_json ? Mandate.safeParse(JSON.parse(row.mandate_json)) : null;
    return {
      waId: row.wa_id,
      name: row.name,
      mandate: parsed?.success ? parsed.data : null,
      mandateConfirmed: row.mandate_confirmed_at !== null,
      holdingsDraft: row.holdings_draft_json ? JSON.parse(row.holdings_draft_json) : null,
      profile: row.profile_json ? JSON.parse(row.profile_json) : null,
      flow: row.flow_json ? JSON.parse(row.flow_json) : null,
    };
  }

  async saveMandateDraft(waId: string, mandate: Mandate): Promise<void> {
    await this.d1.prepare("UPDATE users SET mandate_json = ?, mandate_confirmed_at = NULL WHERE wa_id = ?").bind(JSON.stringify(mandate), waId).run();
  }

  async confirmMandate(waId: string): Promise<boolean> {
    const r = await this.d1
      .prepare("UPDATE users SET mandate_confirmed_at = datetime('now') WHERE wa_id = ? AND mandate_json IS NOT NULL")
      .bind(waId)
      .run();
    return r.meta.changes === 1;
  }

  async saveFlow(waId: string, flow: FlowState): Promise<void> {
    await this.d1.prepare("UPDATE users SET flow_json = ? WHERE wa_id = ?").bind(JSON.stringify(flow), waId).run();
  }

  async saveProfile(waId: string, profile: ProfileState | null): Promise<void> {
    await this.d1.prepare("UPDATE users SET profile_json = ? WHERE wa_id = ?").bind(profile ? JSON.stringify(profile) : null, waId).run();
  }

  async saveHoldingsDraft(waId: string, draft: HoldingInput[] | null): Promise<void> {
    await this.d1.prepare("UPDATE users SET holdings_draft_json = ? WHERE wa_id = ?").bind(draft ? JSON.stringify(draft) : null, waId).run();
  }

  async holdings(waId: string): Promise<Holding[]> {
    const { results } = await this.d1
      .prepare("SELECT symbol, shares, cost_pesewas, cost_source FROM holdings WHERE wa_id = ? ORDER BY symbol")
      .bind(waId)
      .all<{ symbol: string; shares: number; cost_pesewas: number; cost_source: Holding["source"] }>();
    return results.map((r) => ({ symbol: r.symbol, shares: BigInt(r.shares), cost: BigInt(r.cost_pesewas), source: r.cost_source }));
  }

  /** Replaces the given symbols' holdings (others are kept) and clears the draft. */
  async upsertHoldings(waId: string, holdings: Holding[]): Promise<void> {
    await this.d1.batch([
      ...holdings.map((h) =>
        this.d1
          .prepare(
            `INSERT INTO holdings (wa_id, symbol, shares, cost_pesewas, cost_source) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (wa_id, symbol) DO UPDATE SET shares = excluded.shares, cost_pesewas = excluded.cost_pesewas,
             cost_source = excluded.cost_source, updated_at = datetime('now')`,
          )
          .bind(waId, h.symbol, Number(h.shares), Number(h.cost), h.source),
      ),
      this.d1.prepare("UPDATE users SET holdings_draft_json = NULL WHERE wa_id = ?").bind(waId),
    ]);
  }

  async removeHolding(waId: string, symbol: string): Promise<boolean> {
    const r = await this.d1.prepare("DELETE FROM holdings WHERE wa_id = ? AND symbol = ?").bind(waId, symbol).run();
    return r.meta.changes === 1;
  }

  async history(waId: string, limit = 20): Promise<{ role: "user" | "assistant"; content: string }[]> {
    const { results } = await this.d1
      .prepare("SELECT role, content FROM messages WHERE wa_id = ? ORDER BY id DESC LIMIT ?")
      .bind(waId, limit)
      .all<{ role: "user" | "assistant"; content: string }>();
    return results.reverse();
  }

  async addMessage(waId: string, role: "user" | "assistant", content: string): Promise<void> {
    await this.d1.prepare("INSERT INTO messages (wa_id, role, content) VALUES (?, ?, ?)").bind(waId, role, content).run();
  }

  async audit(waId: string, kind: string, detail: unknown): Promise<void> {
    await this.d1.prepare("INSERT INTO audit (wa_id, kind, detail_json) VALUES (?, ?, ?)").bind(waId, kind, bigintJson(detail)).run();
  }

  async createIntent(i: Intent): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO intents (id, wa_id, side, symbol, shares, price_pesewas, net_pesewas, rationale, verdict_json, signature, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(i.id, i.waId, i.side, i.symbol, Number(i.shares), Number(i.price), Number(i.net), i.rationale, bigintJson(i.verdict), i.signature, i.status, i.expiresAt)
      .run();
  }

  async intent(waId: string, id: string): Promise<Intent | null> {
    const r = await this.d1.prepare("SELECT * FROM intents WHERE id = ? AND wa_id = ?").bind(id, waId).first<IntentRow>();
    if (!r) return null;
    return {
      id: r.id,
      waId: r.wa_id,
      side: r.side,
      symbol: r.symbol,
      shares: BigInt(r.shares),
      price: BigInt(r.price_pesewas),
      net: BigInt(r.net_pesewas),
      rationale: r.rationale,
      verdict: JSON.parse(r.verdict_json),
      signature: r.signature,
      status: r.status,
      expiresAt: r.expires_at,
    };
  }

  /** Moves an intent on only from the expected state, so a double tap can't execute twice. */
  async transition(id: string, from: IntentStatus, to: IntentStatus): Promise<boolean> {
    const r = await this.d1
      .prepare("UPDATE intents SET status = ?, decided_at = COALESCE(decided_at, datetime('now')) WHERE id = ? AND status = ?")
      .bind(to, id, from)
      .run();
    return r.meta.changes === 1;
  }

  /** A new proposal for a stock supersedes any still waiting for that stock; other stocks' proposals stay open. */
  async expireOpenIntents(waId: string, symbol: string): Promise<void> {
    await this.d1
      .prepare("UPDATE intents SET status = 'EXPIRED', decided_at = datetime('now') WHERE wa_id = ? AND symbol = ? AND status = 'PROPOSED'")
      .bind(waId, symbol)
      .run();
  }

  async boughtThisMonth(waId: string): Promise<bigint> {
    const r = await this.d1
      .prepare("SELECT COALESCE(SUM(net_pesewas), 0) AS total FROM fills WHERE wa_id = ? AND side = 'BUY' AND at >= date('now', 'start of month')")
      .bind(waId)
      .first<{ total: number }>();
    return BigInt(r?.total ?? 0);
  }

  /** Records the fill, updates the holding (sells remove cost pro rata) and marks the intent FILLED, atomically. */
  async recordFill(f: FillRecord, holdingBefore: Holding | undefined): Promise<void> {
    const c = f.charges;
    const statements = [
      this.d1
        .prepare(
          `INSERT INTO fills (intent_id, wa_id, side, symbol, shares, price_pesewas, gross_pesewas, charges_pesewas, net_pesewas, lines_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(f.intentId, f.waId, f.side, f.symbol, Number(f.shares), Number(f.price), Number(c.gross), Number(c.total), Number(c.net), bigintJson(c.lines)),
      this.d1.prepare("UPDATE intents SET status = 'FILLED' WHERE id = ? AND status = 'APPROVED'").bind(f.intentId),
    ];
    const before = holdingBefore ?? { symbol: f.symbol, shares: 0n, cost: 0n, source: "given" as const };
    const shares = f.side === "BUY" ? before.shares + f.shares : before.shares - f.shares;
    const cost = f.side === "BUY" ? before.cost + c.net : before.cost - (before.cost * f.shares) / before.shares;
    if (shares > 0n) {
      statements.push(
        this.d1
          .prepare(
            `INSERT INTO holdings (wa_id, symbol, shares, cost_pesewas, cost_source) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (wa_id, symbol) DO UPDATE SET shares = excluded.shares, cost_pesewas = excluded.cost_pesewas, updated_at = datetime('now')`,
          )
          .bind(f.waId, f.symbol, Number(shares), Number(cost), before.source),
      );
    } else {
      statements.push(this.d1.prepare("DELETE FROM holdings WHERE wa_id = ? AND symbol = ?").bind(f.waId, f.symbol));
    }
    await this.d1.batch(statements);
  }

  /** Users the monitor should watch: confirmed mandate, newest first. */
  async watchedUsers(): Promise<string[]> {
    // Web demo users ("web-…") have no WhatsApp number to message.
    const { results } = await this.d1
      .prepare("SELECT wa_id FROM users WHERE mandate_confirmed_at IS NOT NULL AND wa_id NOT LIKE 'web-%'")
      .all<{ wa_id: string }>();
    return results.map((r) => r.wa_id);
  }

  /** WhatsApp only allows free-form messages within 24 hours of the user's last message. */
  async inServiceWindow(waId: string): Promise<boolean> {
    const r = await this.d1
      .prepare("SELECT 1 AS ok FROM messages WHERE wa_id = ? AND role = 'user' AND at > datetime('now', '-23 hours') LIMIT 1")
      .bind(waId)
      .first<{ ok: number }>();
    return r !== null;
  }

  /** Claims an alert key; false if it was already sent. */
  async claimAlert(waId: string, key: string): Promise<boolean> {
    const r = await this.d1.prepare("INSERT OR IGNORE INTO alerts_sent (wa_id, key) VALUES (?, ?)").bind(waId, key).run();
    return r.meta.changes === 1;
  }

  /**
   * Counts one web-demo message against three daily allowances: this chat, this network (a hashed
   * IP, so new chats from one place share it), and the whole demo. False once any is used up.
   */
  async allowTryMessage(session: string, network: string, limits: { perSession: number; perNetwork: number; perDay: number }): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const total = await this.d1
      .prepare("SELECT COALESCE(SUM(count), 0) AS n FROM try_usage WHERE day = ? AND session NOT LIKE 'net:%'")
      .bind(day)
      .first<{ n: number }>();
    if ((total?.n ?? 0) >= limits.perDay) return false;
    const bump = (key: string) =>
      this.d1
        .prepare("INSERT INTO try_usage (session, day, count) VALUES (?, ?, 1) ON CONFLICT (session, day) DO UPDATE SET count = count + 1 RETURNING count")
        .bind(key, day);
    const [net, chat] = await this.d1.batch<{ count: number }>([bump(`net:${network}`), bump(session)]);
    return (net?.results[0]?.count ?? 0) <= limits.perNetwork && (chat?.results[0]?.count ?? 0) <= limits.perSession;
  }

  /** The secret token for this user's activity page, created on first use. */
  async viewToken(waId: string): Promise<string> {
    const row = await this.d1.prepare("SELECT view_token FROM users WHERE wa_id = ?").bind(waId).first<{ view_token: string | null }>();
    if (row?.view_token) return row.view_token;
    const token = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await this.d1.prepare("UPDATE users SET view_token = ? WHERE wa_id = ? AND view_token IS NULL").bind(token, waId).run();
    return (await this.d1.prepare("SELECT view_token FROM users WHERE wa_id = ?").bind(waId).first<{ view_token: string }>())!.view_token;
  }

  async userByViewToken(token: string): Promise<string | null> {
    const row = await this.d1.prepare("SELECT wa_id FROM users WHERE view_token = ?").bind(token).first<{ wa_id: string }>();
    return row?.wa_id ?? null;
  }

  async auditTrail(waId: string, limit = 400): Promise<{ id: number; kind: string; detail: unknown; at: string }[]> {
    const { results } = await this.d1
      .prepare("SELECT id, kind, detail_json, at FROM audit WHERE wa_id = ? ORDER BY id DESC LIMIT ?")
      .bind(waId, limit)
      .all<{ id: number; kind: string; detail_json: string; at: string }>();
    return results.reverse().map((r) => ({ id: r.id, kind: r.kind, detail: JSON.parse(r.detail_json), at: r.at }));
  }

  async intentsFor(waId: string): Promise<Intent[]> {
    const { results } = await this.d1.prepare("SELECT id FROM intents WHERE wa_id = ? ORDER BY created_at").bind(waId).all<{ id: string }>();
    const all = await Promise.all(results.map((r) => this.intent(waId, r.id)));
    return all.filter((i): i is Intent => i !== null);
  }

  async fillsFor(waId: string): Promise<{ intentId: string; shares: number; price: number; charges: number; net: number; at: string }[]> {
    const { results } = await this.d1
      .prepare("SELECT intent_id, shares, price_pesewas, charges_pesewas, net_pesewas, at FROM fills WHERE wa_id = ? ORDER BY id")
      .bind(waId)
      .all<{ intent_id: string; shares: number; price_pesewas: number; charges_pesewas: number; net_pesewas: number; at: string }>();
    return results.map((r) => ({ intentId: r.intent_id, shares: r.shares, price: r.price_pesewas, charges: r.charges_pesewas, net: r.net_pesewas, at: r.at }));
  }

  async saveTape(snapshot: unknown, depth: Record<string, unknown>): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("INSERT INTO market_tape (snapshot_json, depth_json) VALUES (?, ?)").bind(JSON.stringify(snapshot), JSON.stringify(depth)),
      this.d1.prepare("DELETE FROM market_tape WHERE id NOT IN (SELECT id FROM market_tape ORDER BY id DESC LIMIT 60)"),
    ]);
  }

  async latestTape(): Promise<Tape | null> {
    const r = await this.d1.prepare("SELECT at, snapshot_json, depth_json FROM market_tape ORDER BY id DESC LIMIT 1").first<{ at: string; snapshot_json: string; depth_json: string }>();
    return r ? { at: r.at, snapshot: JSON.parse(r.snapshot_json), depth: JSON.parse(r.depth_json) } : null;
  }

  /** Demo helper: forget everything about this user. */
  async reset(waId: string): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("DELETE FROM holdings WHERE wa_id = ?").bind(waId),
      this.d1.prepare("DELETE FROM fills WHERE wa_id = ?").bind(waId),
      this.d1.prepare("DELETE FROM alerts_sent WHERE wa_id = ?").bind(waId),
      this.d1.prepare("DELETE FROM intents WHERE wa_id = ?").bind(waId),
      this.d1.prepare("DELETE FROM messages WHERE wa_id = ?").bind(waId),
      this.d1.prepare("DELETE FROM audit WHERE wa_id = ?").bind(waId),
      this.d1.prepare("DELETE FROM users WHERE wa_id = ?").bind(waId),
    ]);
  }
}
