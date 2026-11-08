// Methods: the website's methods page (web/index.html #references), inside the app. Every "method" link opens this
// page at its card, as on the website.
import { useLocalSearchParams } from 'expo-router'

import { SitePage, type PageBlock } from '../components/page-blocks'
import pages from '../content/pages.json'

export default function Methods() {
  const { focus } = useLocalSearchParams<{ focus?: string }>()
  return <SitePage blocks={pages.methods as PageBlock[]} focus={focus} />
}
