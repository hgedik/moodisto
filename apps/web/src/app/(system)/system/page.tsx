import { redirect } from 'next/navigation';

export default function SystemIndexPage(): never {
  redirect('/system/settings');
}
