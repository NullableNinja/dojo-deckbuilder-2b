/**
 * Executable mode boundary for every local consumer.
 *
 * Every mode is declared canonically under `definition.modes`. A declared mode
 * is executable only when its `executable.engine` flag is set, so a mode whose
 * rules are filed but whose engine support is still being built stays
 * explicitly unavailable. This module never infers mode rules from prose.
 */
export function declaredModes(data) {
  const definition = data?.definition;
  const modes = Array.isArray(definition?.modes) ? definition.modes : [];
  if (modes.length) return modes.map((mode) => structuredClone(mode));
  // Older generated data only described the single legacy mode.
  return definition?.mode?.id ? [{ ...structuredClone(definition.mode), executable: { engine: true } }] : [];
}

export function executableModes(data) {
  return declaredModes(data)
    .filter((mode) => mode.executable?.engine === true || mode.executable === true)
    .map((mode) => ({ ...mode, executable: true }));
}

export function modeSummary(data) {
  const executable = executableModes(data);
  const executableIds = new Set(executable.map((mode) => mode.id));
  return {
    executable,
    unavailable: declaredModes(data).filter((mode) => !executableIds.has(mode.id)).map((mode) => ({ id: mode.id, title: mode.title, executable: false })),
  };
}

export function requireExecutableMode(data, requestedMode = null) {
  const requested = requestedMode || data?.definition?.mode?.id;
  const mode = executableModes(data).find((candidate) => candidate.id === requested);
  if (!mode) {
    const available = executableModes(data).map((candidate) => candidate.id).join(", ") || "none";
    throw new Error(`Mode ${requested ?? "(missing)"} is not executable in canonical rules ${data?.definition?.rulesVersion ?? "unknown"}. Executable modes: ${available}. Add the mode definition canonically before simulating it.`);
  }
  return mode;
}
