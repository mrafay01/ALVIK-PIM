"use client";

import { Plus, X } from "lucide-react";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export const BULLET_FEATURES_MIN_VISIBLE = 5;
export const BULLET_FEATURES_REQUIRED = 3;
export const BULLET_FEATURES_MAX = 10;

// Individual boxes rather than one "one per line" textarea — the first
// BULLET_FEATURES_REQUIRED are mandatory listing copy, shown from the
// start alongside BULLET_FEATURES_MIN_VISIBLE total; "Add feature point"
// reveals more up to BULLET_FEATURES_MAX.
export function BulletFeaturesEditor({
  values,
  boxCount: boxCountProp,
  onChange,
  onBoxCountChange,
}: {
  values: string[];
  /** How many boxes are currently shown — tracked by the parent so it
   * survives independently of which boxes have text (e.g. box 2 can be
   * emptied without collapsing back to 5 visible boxes). */
  boxCount: number;
  onChange: (next: string[]) => void;
  onBoxCountChange: (next: number) => void;
}) {
  const boxCount = Math.min(Math.max(boxCountProp, BULLET_FEATURES_MIN_VISIBLE), BULLET_FEATURES_MAX);

  function setAt(i: number, text: string) {
    const next = [...values];
    while (next.length <= i) next.push("");
    next[i] = text;
    onChange(next);
  }

  function removeAt(i: number) {
    const next = [...values];
    next[i] = "";
    onChange(next);
    onBoxCountChange(Math.max(BULLET_FEATURES_MIN_VISIBLE, boxCount - 1));
  }

  function addPoint() {
    onBoxCountChange(Math.min(BULLET_FEATURES_MAX, boxCount + 1));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {Array.from({ length: boxCount }).map((_, i) => {
          const required = i < BULLET_FEATURES_REQUIRED;
          const canRemove = i >= BULLET_FEATURES_MIN_VISIBLE;
          return (
            <div key={i} className="flex items-end gap-2">
              <Field label={`Feature point ${i + 1}${required ? " *" : ""}`} width="100%">
                <Input
                  value={values[i] ?? ""}
                  onChange={(e) => setAt(i, e.target.value)}
                  required={required}
                  maxLength={500}
                  placeholder={required ? "Required" : "Optional"}
                />
              </Field>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove feature point ${i + 1}`}
                  className="shrink-0 mb-[3px] p-2 rounded-sm border border-border-strong bg-surface text-ink-faint hover:text-critical hover:border-critical transition-colors duration-150"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {boxCount < BULLET_FEATURES_MAX && (
        <div>
          <Button type="button" size="sm" onClick={addPoint}>
            <span className="flex items-center gap-1.5">
              <Plus size={13} /> Add feature point
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
