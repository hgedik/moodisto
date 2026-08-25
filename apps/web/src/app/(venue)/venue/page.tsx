import { redirect } from 'next/navigation';

export default function VenueIndexPage(): never {
  redirect('/venue/dashboard');
}
