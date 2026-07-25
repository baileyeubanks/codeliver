"use client";

/**
 * Estimate line-item editor — the ROOT money-console spreadsheet pattern
 * (docs/COVIDEOPRO_CCO_UNIVERSE_ADOPTION.md §O/§G) ported onto our versioned
 * proposal card. Click a cell to edit it in place; edits accumulate locally
 * and only land when "Save as new version" drafts the next proposal version
 * via saveProposal. Rendered only while the proposal is a draft — the parent
 * keys this component by proposal id + version so a save remounts it clean.
 */

import { useMemo, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { saveProposal, useDemoWorkspace } from "@/lib/demo/workspace-store";
import { activeRateCard, lineFromRateItem } from "@/lib/covideopro/bid.ts";
import { formatCents } from "@/lib/covideopro/payments.ts";
import {
  ESTIMATE_CATEGORIES,
  estimateLineTotal,
  proposalTotals,
  type EstimateCategory,
  type EstimateLine,
  type Proposal,
  type RateItem,
} from "@/lib/covideopro/record.ts";

type EditableField = "description" | "quantity" | "unit_rate" | "markup_pct";

interface EditingCell {
  lineId: string;
  field: EditableField;
  draft: string;
}

const FIELD_LABELS: Record<EditableField, string> = {
  description: "Description",
  quantity: "Quantity",
  unit_rate: "Unit rate",
  markup_pct: "Markup percent",
};

function parsePct(raw: string): number | null {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
}

function draftFor(line: EstimateLine, field: EditableField): string {
  return field === "description" ? line.description : String(line[field]);
}

export default function EstimateLineEditor({
  proposal,
  onNotice,
}: {
  proposal: Proposal;
  onNotice: (message: string) => void;
}) {
  const workspace = useDemoWorkspace();
  const [lines, setLines] = useState<EstimateLine[]>(() =>
    proposal.estimate_lines.map((line) => ({ ...line })),
  );
  const [discountPct, setDiscountPct] = useState(String(proposal.discount_pct));
  const [taxPct, setTaxPct] = useState(String(proposal.tax_pct));
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const idCounter = useRef(0);

  const discount = parsePct(discountPct);
  const tax = parsePct(taxPct);
  const totals = proposalTotals({
    estimate_lines: lines,
    discount_pct: discount ?? 0,
    tax_pct: tax ?? 0,
  });
  const optionalCents = proposalTotals({
    estimate_lines: lines.filter((line) => line.optional),
  }).subtotalCents;
  const dirty =
    JSON.stringify(lines) !== JSON.stringify(proposal.estimate_lines) ||
    (discount !== null && discount !== proposal.discount_pct) ||
    (tax !== null && tax !== proposal.tax_pct);

  const catalog = useMemo(() => {
    const card = activeRateCard(workspace.rateCards);
    if (!card) return { card: null, groups: [] as Array<{ category: EstimateCategory; items: RateItem[] }> };
    const query = catalogQuery.trim().toLowerCase();
    const items = workspace.rateItems.filter(
      (item) =>
        item.rate_card_id === card.id &&
        item.active &&
        (!query ||
          item.description.toLowerCase().includes(query) ||
          item.code.toLowerCase().includes(query)),
    );
    const groups = ESTIMATE_CATEGORIES.map((category) => ({
      category,
      items: items.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0);
    return { card, groups };
  }, [workspace.rateCards, workspace.rateItems, catalogQuery]);

  function nextLineId() {
    idCounter.current += 1;
    return `el-${proposal.id}-${proposal.version + 1}-${idCounter.current}`;
  }

  function updateLine(lineId: string, patch: Partial<EstimateLine>) {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }

  function commitCell() {
    if (!editing) return;
    const line = lines.find((candidate) => candidate.id === editing.lineId);
    if (!line) {
      setEditing(null);
      return;
    }
    if (editing.field === "description") {
      const value = editing.draft.trim();
      if (value) updateLine(editing.lineId, { description: value });
    } else {
      const value = Number(editing.draft);
      const invalid =
        !Number.isFinite(value) ||
        value < 0 ||
        (editing.field === "quantity" && value <= 0);
      if (invalid) {
        onNotice(`${FIELD_LABELS[editing.field]} needs ${editing.field === "quantity" ? "a positive" : "a non-negative"} number — kept the previous value.`);
      } else {
        updateLine(editing.lineId, { [editing.field]: value });
      }
    }
    setEditing(null);
  }

  function renderCell(line: EstimateLine, field: EditableField, display: string, numeric = false) {
    const isEditing = editing?.lineId === line.id && editing.field === field;
    return (
      <td className={numeric ? "estimate-editor-num" : undefined}>
        {isEditing ? (
          <input
            className="estimate-editor-input"
            aria-label={FIELD_LABELS[field]}
            value={editing.draft}
            autoFocus
            inputMode={field === "description" ? undefined : "decimal"}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
            onBlur={commitCell}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitCell();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setEditing(null);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="estimate-editor-value"
            onClick={() => setEditing({ lineId: line.id, field, draft: draftFor(line, field) })}
          >
            {display}
          </button>
        )}
      </td>
    );
  }

  function addBlankLine() {
    const line: EstimateLine = {
      id: nextLineId(),
      category: "other",
      description: "",
      quantity: 1,
      unit_rate: 0,
      markup_pct: 0,
      optional: false,
    };
    setLines((current) => [...current, line]);
    setEditing({ lineId: line.id, field: "description", draft: "" });
  }

  function appendCatalogItem(item: RateItem) {
    setLines((current) => [...current, lineFromRateItem(item, nextLineId())]);
    onNotice(`Added "${item.description}" at the catalog rate — adjust qty/markup in place.`);
  }

  function removeLine(line: EstimateLine) {
    if (!window.confirm(`Remove "${line.description || "Untitled line"}" from the estimate?`)) return;
    setLines((current) => current.filter((candidate) => candidate.id !== line.id));
  }

  function save() {
    if (discount === null || tax === null) {
      onNotice("Discount and tax must be valid non-negative percentages.");
      return;
    }
    if (lines.some((line) => !line.description.trim())) {
      onNotice("Every estimate line needs a description before saving.");
      return;
    }
    const result = saveProposal({
      projectId: proposal.project_id,
      title: proposal.title,
      narrative: proposal.narrative,
      estimateLines: lines,
      validUntil: proposal.valid_until,
      discountPct: discount,
      taxPct: tax,
    });
    if (!result.ok) {
      onNotice(result.reason);
      return;
    }
    onNotice(`Proposal v${proposal.version + 1} drafted with the edited estimate.`);
  }

  function discard() {
    setLines(proposal.estimate_lines.map((line) => ({ ...line })));
    setDiscountPct(String(proposal.discount_pct));
    setTaxPct(String(proposal.tax_pct));
    setEditing(null);
  }

  function renderPctInput(
    raw: string,
    setRaw: (value: string) => void,
    fallback: number,
    label: string,
  ) {
    const invalid = parsePct(raw) === null;
    return (
      <input
        className="estimate-editor-micro"
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setRaw(String(fallback));
          }
        }}
      />
    );
  }

  return (
    <div className="estimate-editor" aria-label="Estimate editor">
      <div className="estimate-editor-main">
        <div className="estimate-editor-toolbar">
          <button type="button" onClick={addBlankLine}><Plus size={14} /> Add line</button>
          <button
            type="button"
            aria-expanded={catalogOpen}
            data-active={catalogOpen || undefined}
            onClick={() => setCatalogOpen((open) => !open)}
          >
            Rate catalog
          </button>
          <span className="estimate-editor-hint">Click any description, qty, rate, or markup cell to edit in place.</span>
        </div>

        <table className="cockpit-record-table estimate-editor-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Markup</th>
              <th>Total</th>
              <th>Opt.</th>
              <th aria-label="Remove line" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} data-optional={line.optional || undefined}>
                <td>
                  <select
                    className="estimate-editor-select"
                    aria-label="Category"
                    value={line.category}
                    onChange={(event) => updateLine(line.id, { category: event.target.value as EstimateCategory })}
                  >
                    {ESTIMATE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </td>
                {renderCell(line, "description", line.description || "—")}
                {renderCell(line, "quantity", String(line.quantity), true)}
                {renderCell(line, "unit_rate", formatCents(Math.round(line.unit_rate * 100)), true)}
                {renderCell(line, "markup_pct", `${line.markup_pct}%`, true)}
                <td className="estimate-editor-num estimate-editor-line-total">
                  {formatCents(Math.round(estimateLineTotal(line) * 100))}
                </td>
                <td className="estimate-editor-center">
                  <input
                    type="checkbox"
                    aria-label={`Optional line: ${line.description || "untitled"}`}
                    checked={line.optional}
                    onChange={(event) => updateLine(line.id, { optional: event.target.checked })}
                  />
                </td>
                <td className="estimate-editor-center">
                  <button
                    type="button"
                    className="estimate-editor-remove"
                    aria-label={`Remove line: ${line.description || "untitled"}`}
                    onClick={() => removeLine(line)}
                  >
                    <X size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 ? (
              <tr><td colSpan={8} className="estimate-editor-empty">No lines yet — add one below or pull from the rate catalog.</td></tr>
            ) : null}
          </tbody>
        </table>

        <footer className="estimate-editor-totals" aria-label="Estimate totals">
          <div>
            <span>Subtotal</span>
            <span className="estimate-editor-num">{formatCents(totals.subtotalCents)}</span>
          </div>
          <div>
            <span>Discount {renderPctInput(discountPct, setDiscountPct, proposal.discount_pct, "Discount percent")} %</span>
            <span className="estimate-editor-num">{formatCents(-totals.discountCents)}</span>
          </div>
          <div>
            <span>Tax {renderPctInput(taxPct, setTaxPct, proposal.tax_pct, "Tax percent")} %</span>
            <span className="estimate-editor-num">{formatCents(totals.taxCents)}</span>
          </div>
          <div className="estimate-editor-grand">
            <span>Total</span>
            <span className="estimate-editor-num">{formatCents(totals.totalCents)}</span>
          </div>
          {optionalCents > 0 ? (
            <div className="estimate-editor-optional">
              <span>Optional add-ons (excluded)</span>
              <span className="estimate-editor-num">{formatCents(optionalCents)}</span>
            </div>
          ) : null}
        </footer>

        {dirty ? (
          <div className="estimate-editor-savebar">
            <button type="button" onClick={save}><Check size={14} /> Save as new version</button>
            <button type="button" onClick={discard}><X size={14} /> Discard</button>
            <span>Saving drafts proposal v{proposal.version + 1}; the current v{proposal.version} stays on record.</span>
          </div>
        ) : null}
      </div>

      <aside className="estimate-editor-catalog" data-open={catalogOpen} aria-label="Rate catalog">
        <div className="estimate-editor-catalog-inner">
          <header>
            <strong>{catalog.card ? `Catalog — ${catalog.card.name}` : "Catalog"}</strong>
            <button type="button" aria-label="Close catalog" onClick={() => setCatalogOpen(false)}><X size={13} /></button>
          </header>
          {catalog.card ? (
            <>
              <input
                className="estimate-editor-input"
                type="search"
                placeholder="Search catalog…"
                aria-label="Search catalog"
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
              />
              {catalog.groups.map((group) => (
                <div key={group.category}>
                  <p className="estimate-editor-catalog-group">{group.category}</p>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="estimate-editor-catalog-item"
                      onClick={() => appendCatalogItem(item)}
                    >
                      <strong>{item.description}</strong>
                      <small>{formatCents(item.unit_rate_cents)} / {item.unit.replace("_", " ")}</small>
                    </button>
                  ))}
                </div>
              ))}
              {catalog.groups.length === 0 ? (
                <p className="estimate-editor-catalog-empty">No active items match “{catalogQuery.trim()}”.</p>
              ) : null}
            </>
          ) : (
            <p className="estimate-editor-catalog-empty">No active rate card — activate one before pulling catalog lines.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
