// ./privacy: the website's privacy page (web/index.html #privacy), inside the app, word for word (content/pages.json).
import { SitePage, type PageBlock } from '../components/page-blocks'
import pages from '../content/pages.json'

export default function Privacy() {
  return <SitePage blocks={pages.privacy as PageBlock[]} />
}
