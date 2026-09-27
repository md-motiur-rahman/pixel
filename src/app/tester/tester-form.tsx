"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { searchBrands, searchModels } from "./search-actions";
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
      className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-200/60 sm:p-6"
    >
      <Combobox
        label="Brand"
        placeholder="e.g. Canon"
        value={brand}
        onSelect={(opt) => {
          setBrand(opt);
          setModel(null);
          setModelName("");
        }}
        onCreateNew={(name) => {
          setBrand(null);
          setBrandName(name);
          setModel(null);
          setModelName("");
        }}
        search={searchBrands}
      />

      <Combobox
        key={brand?.id ?? "no-brand"}
        label="Model"
        placeholder="e.g. PowerShot SX220IS"
        disabled={!effectiveBrandName}
        value={model}
        onSelect={setModel}
        onCreateNew={(name) => {
          setModel(null);
          setModelName(name);
        }}
        search={(q) => (brand?.id ? searchModels(brand.id, q) : Promise.resolve([]))}
      />

      <Field label="Color">
        <Input type="text" required placeholder="e.g. Purple" value={color} onChange={(e) => setColor(e.target.value)} />
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

      <Field label="Serial number">
        <Input type="text" required value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
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
        disabled={submitting || !effectiveBrandName || !effectiveModelName || !color || !serialNumber}
        className="w-full"
      >
        {submitting ? "Saving…" : "Save & print label"}
      </Button>
    </form>
  );
}
