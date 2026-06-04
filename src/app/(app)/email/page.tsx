// Redirect /email → /communications (Gmail tab)
import { redirect } from 'next/navigation'
export default function EmailRedirect() {
  redirect('/communications')
}
