"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { SerialInput } from "@/components/serial-input";
import { ColorSelect } from "@/components/color-select";
import { listModelAsins, searchBrands, searchModels } from "./search-actions";
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
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // ASINs data entry added for the chosen model; the tester picks one.
  const [asinOptions, setAsinOptions] = useState<string[]>([]);
  const [asin, setAsin] = useState("");
  const asinSeqRef = useRef(0);

  async function loadAsins(modelId: string | null) {
    const seq = ++asinSeqRef.current;
    setAsin("");
    if (!modelId) {
      setAsinOptions([]);
      return;
    }
    try {
      const list = await listModelAsins(modelId);
      if (seq !== asinSeqRef.current) return; // a newer model was picked meanwhile
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
        placeholder="e.g. Canon"
        value={brand}
        onSelect={(opt) => {
          setBrand(opt);
          setModel(null);
          setModelName("");
          void loadAsins(null);
        }}
        onCreateNew={(name) => {
          setBrand(null);
          setBrandName(name);
          setModel(null);
          setModelName("");
          void loadAsins(null);
        }}
        search={searchBrands}
      />

      <Combobox
        key={brand?.id ?? "no-brand"}
        label="Model"
        placeholder="e.g. PowerShot SX220IS"
        disabled={!effectiveBrandName}
        value={model}
        onSelect={(opt) => {
          setModel(opt);
          void loadAsins(opt.id);
        }}
        onCreateNew={(name) => {
          setModel(null);
          setModelName(name);
          void loadAsins(null);
        }}
        search={(q) => (brand?.id ? searchModels(brand.id, q) : Promise.resolve([]))}
      />

      {asinOptions.length > 0 && (
        <Field label="ASIN" hint="Pick the ASIN that matches this camera's model and color.">
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

      <Field label="Color">
        <ColorSelect value={color} onValueChange={setColor} />
      </Field>

      <Field label="Grade">
        <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Serial number" hint="Optional — leave blank if the camera has none.">
        <SerialInput value={serialNumber} onValueChange={setSerialNumber} />
      </Field>

      <Field label="Note" hint="Optional — visible to the dispatcher when they pick this camera.">
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
