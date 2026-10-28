import type { SourceInput } from "../src/material";

/**
 * The "today" the test Course is seen from: the JavaScript Course has started and its
 * promises Session has passed, but the fetch Session and the TypeScript Course are Upcoming.
 * Cohorts seeded with the test Course use it as their fixed "today" (ADR 0001).
 */
export const TEST_COURSE_TODAY = "2026-10-01";

const JS_COURSE = { courseName: "Testkurs: JavaScript-grunder", courseStartsOn: "2026-08-24" };

/**
 * A small fictional Course used for tests, local development and the Evaluation Set.
 * Not real Course material, so it can live in the repo and be sent to any provider.
 */
export const testCourse: SourceInput[] = [
  {
    externalId: "variabler-let-const",
    kind: "study-material",
    ...JS_COURSE,
    title: "Variabler: let och const",
    url: "https://example.org/testkurs#let-const",
    text: `I JavaScript deklarerar du variabler med let eller const. En variabel som deklareras med const kan inte tilldelas ett nytt värde. En variabel som deklareras med let kan tilldelas om.

Observera att const inte gör ett objekt oföränderligt: egenskaperna i ett objekt som ligger i en const-variabel kan fortfarande ändras. Det är bindningen, inte värdet, som är konstant.

Använd const som standard och let bara när du vet att värdet ska ändras. Undvik var, som har funktionsscope och kan ge oväntade buggar.`,
  },
  {
    externalId: "arrayer-map-filter",
    kind: "study-material",
    ...JS_COURSE,
    title: "Arrayer: map och filter",
    url: "https://example.org/testkurs#map-filter",
    text: `map skapar en ny array där varje element har transformerats av en funktion. Den ursprungliga arrayen ändras inte.

filter skapar en ny array med de element som funktionen returnerar true för. Både map och filter returnerar alltid en ny array, även om den blir tom.

Ett vanligt fel är att anropa map på något som är undefined, till exempel data som ännu inte har hämtats. Då får du TypeError: Cannot read properties of undefined (reading 'map').`,
  },
  {
    externalId: "pass-promises-async",
    kind: "session",
    ...JS_COURSE,
    title: "Föreläsning: promises och async/await",
    sessionDate: "2026-09-15",
    url: "https://example.org/testkurs#promises",
    text: `Ett promise representerar ett värde som blir tillgängligt senare, till exempel svaret från fetch. Ett promise kan vara pending, fulfilled eller rejected.

Med async och await kan du skriva asynkron kod som läses uppifrån och ned. await pausar funktionen tills promiset är klart. await fungerar bara inuti en async-funktion.

Fel hanteras med try/catch runt await, eller med .catch() på promiset.`,
  },
  {
    externalId: "u01-att-gora-lista",
    kind: "assignment",
    ...JS_COURSE,
    title: "u01 – Att göra-lista",
    url: "https://example.org/testkurs#u01",
    text: `Bygg en att göra-lista i vanilla JavaScript. Användaren ska kunna lägga till, bocka av och ta bort uppgifter. Listan ska sparas i localStorage så att den finns kvar när sidan laddas om.

Kursmål som prövas: att manipulera DOM, att hantera händelser och att använda arrayer med map och filter.`,
  },
  {
    externalId: "kursmal-dom",
    kind: "course-goal",
    ...JS_COURSE,
    title: "Kursmål: DOM-manipulation",
    url: "https://example.org/testkurs#mal-dom",
    text: `Den studerande ska kunna skapa, ändra och ta bort element i DOM med JavaScript.

G: lösningen uppdaterar DOM korrekt utifrån användarens handlingar. VG: lösningen är uppdelad i tydliga funktioner och undviker onödiga omritningar.`,
  },
  {
    externalId: "pass-fetch-api",
    kind: "session",
    ...JS_COURSE,
    title: "Föreläsning: fetch och API:er",
    sessionDate: "2026-12-08",
    url: "https://example.org/testkurs#fetch",
    text: `fetch skickar en HTTP-förfrågan och returnerar ett promise med ett Response-objekt. Svaret läses med response.json(), som också returnerar ett promise.

fetch avvisar bara promiset vid nätverksfel. Ett svar med statuskod 404 eller 500 räknas som lyckat, så kontrollera response.ok innan du läser datan.`,
  },
  {
    externalId: "typescript-typer",
    kind: "study-material",
    courseName: "Testkurs: TypeScript",
    courseStartsOn: "2027-01-11",
    title: "TypeScript: typer och interface",
    url: "https://example.org/testkurs-ts#typer",
    text: `Ett interface beskriver formen på ett objekt: vilka egenskaper det har och vilka typer de har. En typ med union, som string | number, betyder att värdet kan vara det ena eller det andra.

TypeScript kontrollerar typerna när koden kompileras, inte när den körs.`,
  },
];
