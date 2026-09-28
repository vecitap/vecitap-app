/**
 * El pitido y la vibración del veredicto — garita.html:292-303. 880Hz si
 * pasa, 220Hz si no; vibración corta si pasa, un patrón más largo si no.
 * Ninguna de las dos APIs está garantizada (`AudioContext` puede fallar por
 * política de autoplay sin gesto previo del usuario; `navigator.vibrate` no
 * existe en iOS) — igual que el original, que las envuelve en try/catch:
 * el sonido es un plus, no una condición para que la garita funcione.
 */
let sonar: AudioContext | null = null;

export function pitar(ok: boolean) {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    sonar = sonar || new Ctor();
    const o = sonar.createOscillator();
    const g = sonar.createGain();
    o.connect(g);
    g.connect(sonar.destination);
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.07;
    o.start();
    o.stop(sonar.currentTime + (ok ? 0.12 : 0.35));
  } catch {
    // idem
  }
  try {
    navigator.vibrate?.(ok ? 60 : [90, 70, 90]);
  } catch {
    // idem
  }
}
