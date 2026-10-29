"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { SerialInput } from "@/components/serial-input";
import { ColorSelect } from "@/components/color-select";
import { ColorPill } from "@/components/color-pill";
import { listModelAsins, listModelColours, searchBrands, searchModels } from "./search-actions";
import { createTestedUnit } from "./actions";
import { Button, Field, Input, Message, Select } from "@/components/ui";

type Grade = { id: string; code: string; label: string };

export function TesterForm({ grades }: { grades: Grade[] }) {
  const router = useRouter();
  const [brand, setBrand] = useState<ComboboxOption | null>(null);
  const [brandName, setBrandName] = useState("");
  const [model, setModel] = useState<ComboboxOption | null>(null);
  const [modelName, setModelName] = useState("");
  const [color, setColor] = useState("");
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? "");
  const [serialNumber, setSerialNumber] = useState("");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // ASINs data entry added for the chosen model AND colour; the tester picks one.
  const [asinOptions, setAsinOptions] = useState<string[]>([]);
  const [asin, setAsin] = useState("");
  const asinSeqRef = useRef(0);
  // Colours this model is already known in (data entry or earlier items).
  const [knownColours, setKnownColours] = useState<string[]>([]);
  const coloursSeqRef = useRef(0);

  async function loadColours(modelId: string | null) {
    const seq = ++coloursSeqRef.current;
    setKnownColours([]);
    if (!modelId) return;
    try {
      const list = await listModelColours(modelId);
      if (seq === coloursSeqRef.current) setKnownColours(list);
    } catch {
      // Suggestions only — the full colour list still works.
    }
  }

  function pickColour(next: string) {
    setColor(next);
    void loadAsins(model?.id ?? null, next);
  }

  async function loadAsins(modelId: string | null, forColor: string) {
    const seq = ++asinSeqRef.current;
    setAsin("");
    if (!modelId || !forColor) {
      setAsinOptions([]);
      return;
    }
    try {
      const list = await listModelAsins(modelId, forColor);
      if (seq !== asinSeqRef.current) return; // a newer model or colour was picked meanwhile
      setAsinOptions(list);
      if (list.length === 1) setAsin(list[0]);
    } catch {
      if (seq === asinSeqRef.current) setAsinOptions([]);
    }
  }

  const effectiveBrandName = brand?.label ?? brandName;
  const effectiveModelName = model?.label ?? modelName;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await createTestedUnit({
        brandId: brand?.id ?? null,
        brandName: effectiveBrandName,
        modelId: model?.id ?? null,
        modelName: effectiveModelName,
        color,
        gradeId,
        serialNumber,
        note,
        buyingPrice,
        asin: asin || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(`/tester/print/${result.unitId}`);
    } catch {
      setError("Could not save — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glass space-y-5 rounded-3xl p-5 sm:p-6"
    >
      <Combobox
        label="Brand"
        placeholder="e.g. Apple, Sony, Canon"
        value={brand}
        onSelect={(opt) => {
          setBrand(opt);
          setModel(null);
          setModelName("");
          void loadAsins(null, color);
          void loadColours(null);
        }}
        onCreateNew={(name) => {
          setBrand(null);
          setBrandName(name);
          setModel(null);
          setModelName("");
          void loadAsins(null, color);
          void loadColours(null);
        }}
        search={searchBrands}
      />

      <Combobox
        key={brand?.id ?? "no-brand"}
        label="Model"
        placeholder="e.g. iPhone 13, PlayStation 5, PowerShot SX220IS"
        disabled={!effectiveBrandName}
        value={model}
        onSelect={(opt) => {
          setModel(opt);
          void loadAsins(opt.id, color);
          void loadColours(opt.id);
        }}
        onCreateNew={(name) => {
          setModel(null);
          setModelName(name);
          void loadAsins(null, color);
          void loadColours(null);
        }}
        search={(q) => (brand?.id ? searchModels(brand.id, q) : Promise.resolve([]))}
      />

      <Field label="Color">
        <ColorSelect value={color} onValueChange={pickColour} />
      </Field>
      {knownColours.length > 0 && (
        <div className="-mt-3">
          <p className="mb-1.5 text-xs text-fg-subtle">This model comes in:</p>
          <div className="flex flex-wrap gap-1.5">
            {knownColours.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c.toLowerCase() === color.toLowerCase()}
                onClick={() => pickColour(c)}
                className={
                  "rounded-full p-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-accent/60 " +
                  (c.toLowerCase() === color.toLowerCase() ? "ring-2 ring-accent" : "hover:opacity-80")
                }
              >
                <ColorPill color={c} />
              </button>
            ))}
          </div>
        </div>
      )}

      {asinOptions.length > 0 && (
        <Field label="ASIN" hint="ASINs data entry added for this model in this colour.">
          <Select required value={asin} onChange={(e) => setAsin(e.target.value)} className="font-mono">
            <option value="">Select an ASIN…</option>
            {asinOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Grade">
        <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Buying price (£)" hint="Optional for now — what the item cost, used later to work out profit.">
        <Input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 85.00"
          value={buyingPrice}
          onChange={(e) => setBuyingPrice(e.target.value)}
        />
      </Field>

      <Field label="Serial number" hint="Optional — leave blank if the item has none.">
        <SerialInput value={serialNumber} onValueChange={setSerialNumber} />
      </Field>

      <Field label="Note" hint="Optional — visible to the dispatcher when they pick this item.">
        <Input
          type="text"
          placeholder="e.g. with adapter, missing battery"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {error && <Message variant="error">{error}</Message>}

      <Button
        type="submit"
        disabled={
          submitting ||
          !effectiveBrandName ||
          !effectiveModelName ||
          !color ||
          (asinOptions.length > 0 && !asin)
        }
        className="w-full"
      >
        {submitting ? "Saving…" : "Save & print label"}
      </Button>
    </form>
  );
}
