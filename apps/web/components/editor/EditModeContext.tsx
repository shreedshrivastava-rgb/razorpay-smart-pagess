"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface EditModeContextValue {
  editMode: boolean;
  toggle: () => void;
  enable: () => void;
  fields: Record<string, string>;
  setField: (key: string, value: string) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  saveError: string;
  setSaveError: (v: string) => void;
}

const EditModeContext = createContext<EditModeContextValue | null>(null);

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const toggle = useCallback(() => setEditMode((v) => !v), []);
  const enable = useCallback(() => setEditMode(true), []);

  const setField = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <EditModeContext.Provider value={{ editMode, toggle, enable, fields, setField, saving, setSaving, saveError, setSaveError }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  const ctx = useContext(EditModeContext);
  if (!ctx) throw new Error("useEditMode must be inside EditModeProvider");
  return ctx;
}

export function useEditModeOptional() {
  return useContext(EditModeContext);
}
