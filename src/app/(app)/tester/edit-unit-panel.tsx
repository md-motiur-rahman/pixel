"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { findUnitForEdit, updateUnitDetails, type EditableUnit } from "./edit-actions";
import { searchBrands, searchModels } from "./search-actions";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Button, Card, Field, Input, Message, Select } from "@/components/ui";
import { SerialInput } from "@/components/serial-input";
import { ColorSelect } from "@/components/color-select";
import { CameraScanButton } from "@/components/camera-scan-button";

type Grade = { id: string; code: string; label: string };

export function EditUnitPanel({ grades }: { grades: Grade[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<EditableUnit | null>(null);
  const [brand, setBrand] = useState<ComboboxOption | null>(null);
  const [brandName, setBrandName] = useState("");
  const [model, setModel] = useState<ComboboxOption | null>(null);
  const [modelName, setModelName] = useState("");
  const [color, setColor] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [note, setNote] = useState("");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveBrandName = brand?.label ?? brandName;
  const effectiveModelName = model?.label ?? modelName;
  // A camera scan and a manual "Find" click can both be in flight at once;
  // if the older one resolves last, it must not overwrite the newer result.
  const searchSeqRef = useRef(0);

  async function performSearch(value: string) {
    const seq = ++searchSeqRef.current;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setUnit(null);

    try {
      const result = await findUnitForEdit(value);
      if (seq !== searchSeqRef.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUnit(result.unit);
      setBrand({ id: result.unit.brandId, label: result.unit.brand });
      setBrandName(result.unit.brand);
      setModel({ id: result.unit.modelId, label: result.unit.model });
      setModelName(result.unit.model);
      setColor(result.unit.color);
      setSerialNumber(result.unit.serialNumber);
      setNote(result.unit.note ?? "");
      setBuyingPrice(result.unit.buyingPrice);
      setGradeId(result.unit.gradeId);
    } catch {
      if (seq !== searchSeqRef.current) return;
      setError("Could not search — check your connection and try again.");
    } finally {
      if (seq === searchSeqRef.current) setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    void performSearch(search);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!unit) return;
    setSaving(true);
    setError(null);

    try {
      const result = await updateUnitDetails(unit.id, {
        brandId: brand?.id ?? null,
        brandName: effectiveBrandName,
        modelId: model?.id ?? null,
        modelName: effectiveModelName,
        color,
        gradeId,
        serialNumber,
        note,
        buyingPrice,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUnit(result.unit);
      setBrand({ id: result.unit.brandId, label: result.unit.brand });
      setBrandName(result.unit.brand);
      setModel({ id: result.unit.modelId, label: result.unit.model });
      setModelName(result.unit.model);
      setColor(result.unit.color);
      setBuyingPrice(result.unit.buyingPrice);
      setSuccess("Saved.");
    } catch {
      setError("Could not save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-link hover:text-link-hover"
      >
        Find a saved camera — reprint its label or fix a mistake
      </button>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Find a saved camera</h2>
          <p className="mt-0.5 text-xs text-fg-subtle">Reprint its QR label or correct its details.</p>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            setUnit(null);
            setSearch("");
            setBrand(null);
            setBrandName("");
            setModel(null);
            setModelName("");
            setColor("");
            setError(null);
            setSuccess(null);
          }}
          className="text-sm text-fg-muted hover:text-fg"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSearch} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <SerialInput
            placeholder="Type or scan the serial number"
            aria-label="Serial number or QR"
            value={search}
            onValueChange={setSearch}
            onScanned={(scanned) => void performSearch(scanned)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={loading}>
          {loading ? "Finding…" : "Find"}
        </Button>
      </form>

      <div className="mt-3">
        <CameraScanButton
          onScan={(value) => {
            setSearch(value);
            void performSearch(value);
          }}
        />
      </div>

      {error && <Message variant="error" className="mt-3">{error}</Message>}

      {unit && (
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">
              {unit.serialNumber ? `Serial ${unit.serialNumber}` : "No serial number"}
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => router.push(`/tester/print/${unit.id}`)}
            >
              <Printer aria-hidden="true" />
              Reprint label
            </Button>
          </div>

          <Combobox
            key={`brand-${unit.id}`}
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
            key={`model-${unit.id}-${brand?.id ?? brandName}`}
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

          <Field
            label="Buying price (£)"
            hint={unit.buyingPrice ? undefined : "None recorded yet — enter it, or leave blank to skip."}
          >
            <Input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 85.00"
              value={buyingPrice}
              onChange={(e) => setBuyingPrice(e.target.value)}
            />
          </Field>

          <Field label="Note">
            <Input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {success && <Message variant="success">{success}</Message>}

          <Button
            type="submit"
            disabled={saving || !effectiveBrandName || !effectiveModelName || !color}
            className="w-full"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}
    </Card>
  );
}
