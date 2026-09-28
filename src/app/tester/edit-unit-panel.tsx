"use client";

import { useRef, useState } from "react";
import { findUnitForEdit, updateUnitDetails, type EditableUnit } from "./edit-actions";
import { Button, Card, Field, Input, Message, Select } from "@/components/ui";
import { CameraScanButton } from "@/components/camera-scan-button";

type Grade = { id: string; code: string; label: string };

export function EditUnitPanel({ grades }: { grades: Grade[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<EditableUnit | null>(null);
  const [serialNumber, setSerialNumber] = useState("");
  const [note, setNote] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
      setSerialNumber(result.unit.serialNumber);
      setNote(result.unit.note ?? "");
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
      const result = await updateUnitDetails(unit.id, { serialNumber, note, gradeId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUnit(result.unit);
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
        className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        Fix a mistake on a saved camera
      </button>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Fix a saved camera</h2>
        <button
          onClick={() => {
            setOpen(false);
            setUnit(null);
            setSearch("");
            setError(null);
            setSuccess(null);
          }}
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSearch} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          type="text"
          placeholder="Scan the QR or type the serial number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
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
          <p className="text-sm text-neutral-500">
            {unit.brand} {unit.model} — {unit.color}
          </p>

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

          <Field label="Note">
            <Input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {success && <Message variant="success">{success}</Message>}

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}
    </Card>
  );
}
