"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { updateDraft, type DraftPatch } from "@/app/actions";
import { statusClass } from "@/lib/constants";

/** One email draft as the Drafts page passes it in; the times are already formatted in Central time. */
export type Draft = {
  id: string;
  org_id: string;
  assignee: string;
  kind: string;
  seq: number | null;
  group_label: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  body: string;
  original_subject: string;
  original_body: string;
  research_note: string | null;
  note: string | null;
  status: string;
  reviewed_by: string | null;
  thread_url: string | null;
  org: { name: string; town: string | null; state: string | null; category: string | null };
  when: string | null;
  reviewed_when: string | null;
  sent_when: string | null;
};

type Text = { subject: string; body: string; note: string };
const FIELDS = ["subject", "body", "note"] as const;
const PICKS = ["OK to send", "Needs changes", "Skip"] as const;
const lf = (s: string) => s.replace(/\r\n?/g, "\n");

/** The review list. A card stays put until the filters change, even when a new status or an edit takes it out of
 *  the current filter, so the list doesn't shift under the reviewer's finger after each save. */
export default function DraftCards({ drafts }: { drafts: Draft[] }) {
  const [seen, setSeen] = useState(drafts);
  const [list, setList] = useState(drafts);
  if (drafts !== seen) {
    const fresh = new Map(drafts.map((d) => [d.id, d]));
    const known = new Set(list.map((d) => d.id));
    setSeen(drafts);
    setList([...list.map((d) => fresh.get(d.id) ?? d), ...drafts.filter((d) => !known.has(d.id))]);
  }
  return (
    <div className="drafts">
      {list.map((d) => (
        <DraftCard key={d.id} d={d} />
      ))}
    </div>
  );
}

function DraftCard({ d }: { d: Draft }) {
  const done = d.status === "Sent" || d.status === "Bounced";
  const [text, setText] = useState<Text>({ subject: d.subject, body: d.body, note: d.note ?? "" });
  const [status, setStatus] = useState(d.status);
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState("");

  // `latest` is what's on screen and `stored` what the database has; a save sends the difference.
  const latest = useRef(text);
  const stored = useRef(text);
  const wantStatus = useRef<string | null>(null);
  const savedStatus = useRef(d.status);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  const again = useRef(false);

  const dirty = () => !!wantStatus.current || FIELDS.some((k) => latest.current[k] !== stored.current[k]);

  /** Save whatever has changed; one save at a time, and changes made meanwhile go in the next one. */
  async function flush() {
    clearTimeout(timer.current);
    if (busy.current) {
      again.current = true;
      return;
    }
    const patch: DraftPatch = {};
    for (const k of FIELDS) if (latest.current[k] !== stored.current[k]) patch[k] = latest.current[k];
    const st = wantStatus.current;
    if (st) patch.status = st;
    if (!Object.keys(patch).length) {
      setSave("saved");
      setProblem("");
      return;
    }

    busy.current = true;
    setSave("saving");
    let res: { error?: string };
    try {
      res = await updateDraft(d.id, patch);
    } catch {
      res = { error: "Couldn't reach the server. Check the connection." };
    }
    busy.current = false;
    if (st && wantStatus.current === st) wantStatus.current = null;
    if (res.error) {
      setProblem(res.error);
      setSave("error");
      if (st && !wantStatus.current) setStatus(savedStatus.current);
    } else {
      const now = { ...stored.current };
      for (const k of FIELDS) if (patch[k] !== undefined) now[k] = patch[k];
      stored.current = now;
      if (st) savedStatus.current = st;
      setProblem("");
    }
    if (again.current) {
      again.current = false;
      void flush();
    } else if (!res.error) setSave(dirty() ? "saving" : "saved");
  }

  function edit(k: keyof Text, v: string) {
    latest.current = { ...latest.current, [k]: v };
    setText(latest.current);
    setSave("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1000);
  }

  // Clicking the active button puts the draft back to To review.
  function pick(s: string) {
    const next = s === status ? "To review" : s;
    setStatus(next);
    wantStatus.current = next;
    void flush();
  }

  function undo() {
    if (!window.confirm("Put the subject and email back the way Claude wrote them?")) return;
    latest.current = { ...latest.current, subject: d.original_subject, body: d.original_body };
    setText(latest.current);
    void flush();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text.body);
      setCopied("Copied");
    } catch {
      setCopied("Copy failed");
    }
    setTimeout(() => setCopied(""), 1500);
  }

  // Leaving for another page saves right away instead of waiting out the second; closing the tab first asks.
  useEffect(() => () => void flush(), []);
  useEffect(() => {
    if (save === "saved") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const edited = text.subject.trim() !== d.original_subject.trim() || lf(text.body) !== lf(d.original_body);
  const where = [d.org.town, d.org.state].filter(Boolean).join(", ");

  return (
    <article className={`card draft${done ? " done" : ""}`} aria-label={d.org.name}>
      <header className="draft-head">
        {d.seq != null && <span className="seq" title="Number in the batch">{d.seq}</span>}
        <div className="draft-org">
          <Link className="org" href={`/prospects/${d.org_id}`}>{d.org.name}</Link>
          <div className="small muted">{[where, d.org.category, d.group_label].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="draft-tags">
          <span className="tag">{d.kind}</span>
          {edited && <span className="tag edited">Edited</span>}
          <span className={statusClass(done ? d.status : status)}>{done ? d.status : status}</span>
        </div>
      </header>

      <dl className="facts">
        <dt>Sends</dt>
        <dd>{d.when ?? <span className="muted">Not scheduled</span>}</dd>
        <dt>To</dt>
        <dd>{d.to_name ? <>{d.to_name} <span className="muted">&lt;{d.to_email}&gt;</span></> : d.to_email}</dd>
        <dt>From</dt>
        <dd>{d.assignee}</dd>
      </dl>

      {done ? (
        <>
          <div>
            <div className="draft-lbl">Subject</div>
            <strong>{d.subject}</strong>
          </div>
          <div>
            <div className="draft-lbl">Email</div>
            <p className="pre draft-sent">{d.body}</p>
          </div>
          <p className="small" style={{ margin: 0 }}>
            {d.status === "Bounced" ? "Sent and bounced" : "Sent"}
            {d.sent_when ? ` ${d.sent_when}` : ""}
            {d.thread_url && (
              <>
                {" · "}
                <a href={d.thread_url} target="_blank" rel="noopener">Open the email thread</a>
              </>
            )}
          </p>
          {d.note && <p className="small pre" style={{ margin: 0 }}><b>Notes:</b> {d.note}</p>}
        </>
      ) : (
        <>
          <label>
            Subject
            <input
              id={`subj-${d.id}`}
              value={text.subject}
              maxLength={300}
              onChange={(e) => edit("subject", e.target.value)}
              onBlur={() => void flush()}
            />
          </label>
          <div className="stack" style={{ gap: 3 }}>
            <div className="draft-lbl">
              <label htmlFor={`body-${d.id}`}>Email</label>
              {edited && <button type="button" className="linkish" onClick={undo}>Undo my edits</button>}
              <button type="button" className="linkish right" onClick={copy}>{copied || "Copy email"}</button>
            </div>
            <Grow
              id={`body-${d.id}`}
              className="draft-body"
              value={text.body}
              onChange={(e) => edit("body", e.target.value)}
              onBlur={() => void flush()}
            />
          </div>
        </>
      )}

      {d.research_note && (
        <p className="draft-research">
          <b>Why this org:</b> {d.research_note}
        </p>
      )}

      {!done && (
        <>
          <div className="draft-acts">
            <div className="picks" role="group" aria-label="Review">
              {PICKS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`pick pick-${p.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                  aria-pressed={status === p}
                  title={status === p ? "Click again to put it back to To review" : undefined}
                  onClick={() => pick(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <span className={`saved is-${save}`} role="status">
              {save === "saving" ? "Saving…" : save === "error" ? "Not saved" : "Saved"}
            </span>
          </div>
          {save === "error" && (
            <div className="small due-over">
              {problem}{" "}
              <button type="button" className="linkish" onClick={() => void flush()}>Try again</button>
            </div>
          )}
          <label>
            Notes for Claude
            <Grow
              id={`note-${d.id}`}
              rows={2}
              value={text.note}
              placeholder="What to change, or anything Claude should know"
              onChange={(e) => edit("note", e.target.value)}
              onBlur={() => void flush()}
            />
          </label>
          {d.reviewed_by && d.reviewed_when && status !== "To review" && (
            <p className="small muted" style={{ margin: 0 }}>Marked by {d.reviewed_by}, {d.reviewed_when}</p>
          )}
        </>
      )}
    </article>
  );
}

/** A textarea that grows to fit its text instead of scrolling. */
function Grow(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    const y = window.scrollY; // collapsing to measure can scroll the page; put it back
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
    if (window.scrollY !== y) window.scrollTo(0, y);
  };
  useLayoutEffect(fit, [props.value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return <textarea ref={ref} {...props} className={`grow ${props.className ?? ""}`} />;
}
