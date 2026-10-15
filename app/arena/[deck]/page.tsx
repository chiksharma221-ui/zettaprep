import { notFound } from "next/navigation";
import { DECKS } from "@/content/flashcards";
import { ArenaDeck } from "@/components/arena/ArenaDeck";

export function generateStaticParams() {
  return DECKS.map((d) => ({ deck: d.slug }));
}

export default function DeckPage({ params }: { params: { deck: string } }) {
  const deck = DECKS.find((d) => d.slug === params.deck);
  if (!deck) notFound();
  return <ArenaDeck deck={deck} />;
}
