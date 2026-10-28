import type { Metadata } from "next";

export const metadata: Metadata = { title: "Integritet – SocratEase" };

// Plain-language privacy policy. Keep in sync with ADR 0003 (Question Log) and ADR 0006 (AI provider, incl. the abuse-logging exception).
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-24 leading-7">
      <h1 className="text-3xl font-semibold tracking-tight">Integritet i SocratEase</h1>
      <p>
        SocratEase är en kursassistent för studenter på Chas Academy. Den svarar utifrån
        kursmaterialet och hjälper dig att tänka själv. Här beskriver vi vilka uppgifter som
        hanteras och varför.
      </p>

      <h2 className="mt-4 text-xl font-semibold">Inloggning</h2>
      <p>
        Du loggar in med ditt Google-konto från skolan. Vi använder bara din e-postadress för att
        kontrollera att du finns på klasslistan och vilken klass du går i. Din adress finns i en
        krypterad cookie i din webbläsare medan du är inloggad. Vi sparar inte ditt namn eller din
        profilbild.
      </p>

      <h2 className="mt-4 text-xl font-semibold">Klasslistan</h2>
      <p>
        Läraren lägger in klassens e-postadresser från Canvas. Listan används bara för att avgöra
        vem som får logga in och raderas 30 dagar efter att klassen har avslutats.
      </p>

      <h2 className="mt-4 text-xl font-semibold">Dina frågor</h2>
      <p>
        Frågor sparas <strong>anonymt</strong>: de kopplas aldrig till dig eller din e-postadress.
        Kod som du klistrar in sparas inte. Läraren kan läsa frågorna i sammanställd form för att
        se vad i kursmaterialet som behöver förbättras, men kan inte se vem som frågade. Frågorna
        raderas 30 dagar efter att klassen har avslutats. Ett samtal finns bara kvar så länge
        fliken är öppen.
      </p>

      <h2 className="mt-4 text-xl font-semibold">Var uppgifterna behandlas</h2>
      <p>
        Appen körs hos Vercel och databasen hos Neon, båda i Frankfurt (EU). Dina frågor skickas
        till Google Cloud (Vertex AI) i EU för att kunna besvaras. Google får inte träna AI-modeller
        på dem och sparar dem inte efter svaret, med ett undantag: frågor som Googles system
        flaggar som möjligt missbruk kan sparas i upp till 90 dagar i EU och granskas av Google.
        Inloggningen sker via Google.
      </p>

      <h2 className="mt-4 text-xl font-semibold">Kontakt</h2>
      <p>
        Frågor om dina uppgifter? Kontakta din lärare
        {process.env.TEACHER_EMAIL ? ` (${process.env.TEACHER_EMAIL})` : ""}.
      </p>
    </main>
  );
}
