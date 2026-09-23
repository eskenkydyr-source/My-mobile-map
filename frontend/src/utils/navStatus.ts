/**
 * Что показать на экране навигации, пока вести некуда: нет маршрута или ещё нет точки GPS.
 * Раньше экран в этом случае оставался пустым — даже без кнопки «Завершить».
 */

export interface NavWaitStatus {
  title: string
  hint: string
  problem: boolean // само не пройдёт — нужно действие водителя
}

// errorCode — ошибка геолокации: 1 доступ запрещён, 2 недоступна, 3 не ответила вовремя
export function navWaitStatus(hasRoute: boolean, errorCode: number | null): NavWaitStatus {
  if (!hasRoute) {
    return { title: 'Маршрут не найден', hint: 'Завершите навигацию и постройте маршрут заново', problem: true }
  }
  if (errorCode === 1) {
    return { title: 'Нет доступа к GPS', hint: 'Разрешите доступ к местоположению в настройках телефона или браузера', problem: true }
  }
  if (errorCode === 2) {
    return { title: 'GPS недоступен', hint: 'Включите геолокацию на телефоне', problem: true }
  }
  // Таймаут — телефон ещё ищет спутники, это не ошибка
  return { title: 'Ищем GPS…', hint: 'Под открытым небом сигнал находится быстрее', problem: false }
}
