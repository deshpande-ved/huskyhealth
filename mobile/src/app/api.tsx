// ./api: the website's API page (web/api.html), inside the app, word for word (content/pages.json).
import { SitePage, type PageBlock } from '../components/page-blocks'
import pages from '../content/pages.json'

export default function Api() {
  return <SitePage blocks={pages.api as PageBlock[]} />
}
