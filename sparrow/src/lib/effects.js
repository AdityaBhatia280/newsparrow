// Liquid glass is expensive on low-power devices (many school Chromebooks). "auto" turns effects down there.
export function lowPower() {
  const cores = navigator.hardwareConcurrency || 8;
  const memory = navigator.deviceMemory || 8;
  return cores <= 4 || memory <= 4 || navigator.connection?.saveData === true;
}

export function applyEffects(setting = "auto") {
  const reduced =
    setting === "off" ||
    (setting === "auto" && (lowPower() || matchMedia("(prefers-reduced-transparency: reduce)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches));
  document.documentElement.dataset.effects = reduced ? "reduced" : "full";
  // The refraction filter on the dock only renders in Chromium; elsewhere the dock keeps a plain blur.
  const chromium = !!navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand));
  document.documentElement.classList.toggle("refract", chromium && !reduced);
  return reduced ? "reduced" : "full";
}

export const effectsSetting = () => {
  try {
    return localStorage.getItem("sparrow.effects") || "auto";
  } catch {
    return "auto";
  }
};

export function saveEffectsSetting(value) {
  try {
    localStorage.setItem("sparrow.effects", value);
  } catch {}
  return applyEffects(value);
}
