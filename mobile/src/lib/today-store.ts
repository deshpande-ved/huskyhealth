// Today's features and analysis, shared by the Today screen and the detail pages it opens (like the website's state).
import type { Today } from './today'

let current: Today | null = null
export const setToday = (t: Today | null) => { current = t }
export const getToday = () => current
