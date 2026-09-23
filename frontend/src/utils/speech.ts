/**
 * Озвучка подсказок навигации встроенным синтезатором речи браузера (Web Speech API).
 * В мобильном Chrome и Safari работает; в APK (Android WebView) API может не быть —
 * тогда speechSupported() = false и кнопка звука не показывается.
 */
import { nextAnnouncement } from './navVoice'
import type { NavSnapshot } from './navVoice'

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

let ruVoice: SpeechSynthesisVoice | null = null

export function speak(text: string): void {
  if (!speechSupported()) return
  const synth = window.speechSynthesis
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ru-RU'
  // Chrome отдаёт список голосов не сразу — ищем русский, пока не найдём
  ruVoice ??= synth.getVoices().find(v => v.lang.toLowerCase().startsWith('ru')) ?? null
  if (ruVoice) utterance.voice = ruVoice

  if (synth.speaking || synth.pending) {
    // Свежая подсказка важнее недоговорённой. speak() сразу после cancel() в Chrome и Safari иногда теряется
    synth.cancel()
    setTimeout(() => synth.speak(utterance), 60)
  } else {
    synth.speak(utterance)
  }
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}

// Что уже сказано в текущей поездке
const spoken = new Set<string>()

// Вызывается при нажатии «Начать навигацию»: браузеры разрешают звук только в ответ на действие пользователя
export function startVoiceGuidance(enabled: boolean): void {
  spoken.clear()
  if (enabled) speak('Поехали')
}

export function updateVoiceGuidance(snapshot: NavSnapshot): void {
  const a = nextAnnouncement(snapshot, spoken)
  if (!a) return
  spoken.add(a.id)
  speak(a.text)
}
