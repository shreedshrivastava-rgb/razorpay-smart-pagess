"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface EditModeContextValue {
  // True only for the page owner in the editing context — gates all edit affordances.
  canEdit: boolean;
  editMode: boolean;
  toggle: () => void;
  enable: () => void;
  activeField: string | null;
  setActiveField: (key: string | null) => void;
  fields: Record<string, string>;
  setField: (key: string, value: string) => void;
  clearFields: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  saveError: string;
  setSaveError: (v: string) => void;
}

const EditModeContext = createContext<EditModeContextValue | null>(null);

export function EditModeProvider({ children, canEdit = false }: { children: ReactNode; canEdit?: boolean }) {
  const [editMode, setEditMode] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const toggle = useCallback(() => setEditMode((v) => !v), []);
  const enable = useCallback(() => setEditMode(true), []);

  const setField = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFields = useCallback(() => setFields({}), []);

  return (
    <EditModeContext.Provider value={{ canEdit, editMode, toggle, enable, activeField, setActiveField, fields, setField, clearFields, saving, setSaving, saveError, setSaveError }}>
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
