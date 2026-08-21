import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { TRANSCRIPT_VERSION } from "../shared-cache";
import { readTranscriptCheckpoint } from "../transcript-blob";

export const dynamic = "force-dynamic";

const VIDEO_ID = "fX2z-BF8Jac";
const EXPECTED_CUE_COUNT = 3086;
const EXPECTED_SOURCE_HASH = "848c0aaccb244168b09fd3c0b40781f238c2846233dc321bed93a8310eb68327";

type Cue = { start: number; duration: number; text: string };

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function transcriptHash(cues: Cue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) {
    hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}|${normalizeText(cue.text)}\n`);
  }
  return hash.digest("hex");
}

export async function GET() {
  const checkpoint = await readTranscriptCheckpoint(VIDEO_ID, TRANSCRIPT_VERSION, true);
  const cues = checkpoint?.englishTranscript as Cue[] | undefined;
  if (!checkpoint || !Array.isArray(cues)) {
    return NextResponse.json({ error: "checkpoint-unavailable" }, { status: 404 });
  }

  const sourceHash = transcriptHash(cues);
  if (cues.length !== EXPECTED_CUE_COUNT || sourceHash !== EXPECTED_SOURCE_HASH) {
    return NextResponse.json({
      error: "source-mismatch",
      cueCount: cues.length,
      sourceHash,
    }, { status: 409 });
  }

  const understanding = {
    videoId: VIDEO_ID,
    transcriptVersion: TRANSCRIPT_VERSION,
    sourceHash: EXPECTED_SOURCE_HASH,
    cueCount: EXPECTED_CUE_COUNT,
    mainTopic: "A long-form interview with Dr Natasha Campbell-McBride about her GAPS framework, gut ecology, food quality, animal versus plant foods, fermentation, regenerative agriculture, raw dairy and meat stock as foundations of health.",
    purpose: "The host asks for practical explanations of gut health and the GAPS nutritional protocol. Campbell-McBride presents her clinical and philosophical framework, often making strong medical, nutritional, ecological and historical claims; the translation must preserve that these are her claims rather than silently upgrading them into established facts.",
    discussion: [
      "The host opens by asking what outdated gut-health advice persists; Campbell-McBride criticizes germ-theory framing, broad early testing and narrow test-led treatment.",
      "She argues that history-taking, observation and individualized clinical assessment should come before targeted testing, which she reserves for later unresolved questions.",
      "She explains GAPS as Gut and Psychology Syndrome / Gut and Physiology Syndrome and describes a spectrum of individualized versions including full GAPS, introduction, no-plant, ketogenic, higher-carbohydrate and fasting approaches.",
      "A central thesis is that the human body is a microbial community, the gut is its main hub and food is the strongest influence on that ecology; health is framed as microbial balance and harmony.",
      "She criticizes antibiotics, glyphosate, industrial food and industrial agriculture, linking them to microbial disruption, poor food quality and broader ecological damage.",
      "She contrasts animal foods as feeding/building foods with plants as mainly cleansing foods, arguing that plant matter is difficult for humans to digest and contains anti-nutrients.",
      "She recounts a clinical story involving infants diagnosed with FPIES and says this experience led her to develop the no-plant GAPS approach using meat stock, fermented dairy, raw egg yolks and fish stock.",
      "She characterizes veganism as a form of fasting, discusses carnivore diets, climate, India and Weston A. Price, and argues that humans can thrive without plant foods.",
      "She frames grains, sugar and potatoes as addictive and discusses fungal fermentation, auto-brewery syndrome and food-derived opioid-like compounds as mechanisms behind cravings.",
      "The conversation broadens into regenerative agriculture, soil microbiology, mycorrhizal networks, desertification and an explicit analogy between damaged soil ecosystems and a damaged gut microbiome.",
      "They discuss fermentation, homemade kefir, probiotic supplements, raw versus pasteurized dairy, natural versus commercial cow breeds and the guest's preference for raw milk from healthy pastured animals.",
      "The interview closes with meat stock versus bone broth, collagen, whole-animal eating, eggs and practical meal ideas; after the formal outro there is a short unrelated teaser for another episode about upper-gut fermentation."
    ],
    claimsAndPositions: [
      "Campbell-McBride claims that early broad testing is usually wasteful and that targeted testing is more useful later when a specific unresolved question exists.",
      "She claims the body should be understood primarily as a microbial community and that restoring microbial balance through food can improve a wide range of chronic illnesses.",
      "She claims antibiotics, glyphosate and industrially produced food disrupt microbial communities and contribute to disease.",
      "She claims animal foods are the principal foods that feed and build human physical structure, while plant foods mainly cleanse and provide limited nutrients or cofactors.",
      "She claims many plant proteins and fats are unsuitable for building the human body and that plant anti-nutrients can damage tissues and digestion.",
      "She claims the severity of digestive damage determines how much plant matter a person can tolerate and presents long-term no-plant GAPS as viable for some people.",
      "She presents her FPIES infant cases as clinical evidence that a no-plant GAPS approach can restore growth and development in severely affected children.",
      "She claims veganism functions as fasting rather than adequate long-term nourishment and attributes muscle, bone, connective-tissue and brain loss to prolonged vegan diets.",
      "She claims grains, sugar and potatoes are addictive and links grain metabolism by gut microbes to opioid-like compounds and auto-brewery phenomena.",
      "She argues that traditional vegetarianism in India is often driven by poverty and that traditional diets still rely on dairy, eggs, fish or meat when available.",
      "She uses Weston A. Price and indigenous-diet examples to argue that animal foods support robust health, especially in colder climates.",
      "She claims industrial arable agriculture destroys soil microbial structure, drives desertification and mirrors the ecological damage seen in the gut.",
      "She argues that regenerative grazing and pasture-based animal agriculture are the solution to restoring soils and feeding populations.",
      "She claims fermentation pre-digests food, reduces anti-nutrients, increases nutrient availability and supplies beneficial microbial communities.",
      "She considers homemade kefir a superior probiotic to laboratory-grown probiotic capsules and prefers raw milk from healthy pastured natural-breed cows over pasteurized commercial milk.",
      "She distinguishes collagen-rich meat stock from long-cooked bone broth, recommends meat stock during GAPS and says bone broth may be problematic early because of glutamic acid and histamine-related concerns."
    ],
    glossary: [
      { source: "GAPS", greek: "GAPS", note: "Keep the acronym in Latin characters." },
      { source: "Gut and Psychology Syndrome", greek: "Σύνδρομο Εντέρου και Ψυχολογίας" },
      { source: "Gut and Physiology Syndrome", greek: "Σύνδρομο Εντέρου και Φυσιολογίας" },
      { source: "microbial community", greek: "μικροβιακή κοινότητα" },
      { source: "gut microbiome", greek: "εντερικό μικροβίωμα" },
      { source: "gut flora", greek: "εντερική μικροχλωρίδα" },
      { source: "meat stock", greek: "ζωμός κρέατος", note: "Do not translate as bone broth; the guest explicitly distinguishes the two." },
      { source: "bone broth", greek: "ζωμός οστών" },
      { source: "collagen", greek: "κολλαγόνο" },
      { source: "anti-nutrients", greek: "αντιθρεπτικά συστατικά" },
      { source: "lectins", greek: "λεκτίνες" },
      { source: "enzyme inhibitors", greek: "αναστολείς ενζύμων" },
      { source: "phytates", greek: "φυτικά άλατα (phytates)" },
      { source: "salicylates", greek: "σαλικυλικά" },
      { source: "fermentation", greek: "ζύμωση" },
      { source: "kefir grains", greek: "κόκκοι κεφίρ" },
      { source: "biofilm", greek: "βιοφίλμ" },
      { source: "mycorrhiza / mycorrhizal network", greek: "μυκόρριζα / μυκορριζικό δίκτυο" },
      { source: "hyphae", greek: "υφές" },
      { source: "villi", greek: "εντερικές λάχνες" },
      { source: "microvilli", greek: "μικρολάχνες" },
      { source: "glycocalyx", greek: "γλυκοκάλυκας" },
      { source: "auto-brewery syndrome", greek: "σύνδρομο αυτοζυθοποίησης" },
      { source: "FPIES / food protein-induced enterocolitis syndrome", greek: "FPIES / σύνδρομο εντεροκολίτιδας προκαλούμενης από πρωτεΐνες τροφών" }
    ],
    ambiguities: [
      "The repaired transcript still contains occasional obvious ASR wording errors. Correct only when context makes the intended term unambiguous; otherwise translate conservatively.",
      "The line transcribed as 'disease is absence of harm' is contextually very likely 'absence of harmony', because the surrounding sentences repeatedly contrast harmony with imbalance and cacophony.",
      "Occurrences resembling 'gastrophysiology syndrome' refer contextually to Gut and Physiology Syndrome; keep the official GAPS terminology consistent.",
      "'lexins' in the transcript is contextually lectins; 'silver pastures' is likely silvopastures/silvopasture. Normalize only where the intended technical term is clear.",
      "The transcript alternates around the name Nathan Pritikin/Pritikhin. Treat the name cautiously and preserve the clearest supported spelling rather than inventing biographical detail.",
      "A line saying Maasai/Samburu drank raw blood 'from their bones' is likely an ASR error in a context about cattle/bulls; do not fabricate a correction unless the source context is sufficient.",
      "The token 'LST' in the collagen section is unclear and may be a damaged technical term. Do not silently expand it without support.",
      "Spiritual and metaphysical language such as 'food is information', 'energy of love', 'Grand Creator' and 'quantum mechanisms' represents the guest's worldview and must be translated as attributed speech, not reframed as scientific consensus.",
      "Many medical, nutritional, historical and ecological assertions are strong or contested. Preserve modality and attribution exactly; translation is not fact-checking and must neither endorse nor weaken the speaker's stated position.",
      "The material after the formal outro around 6982 seconds is a teaser for another episode and should not be semantically merged into the main interview."
    ],
    toneAndStance: [
      "The guest is highly confident, categorical and often polemical toward mainstream medicine, industrial agriculture, supermarkets and conventional nutrition.",
      "The host is curious and largely receptive but periodically paraphrases, checks understanding and offers mild pushback or practical follow-up questions.",
      "The guest uses vivid analogies: microbial cities, the gut as soil, the body as a microbial community, grains as drugs and industrial food as low-quality building material.",
      "Humor and exaggeration appear alongside serious claims; preserve the rhetorical force without adding sarcasm that is not present.",
      "The discussion shifts between clinical language, practical cooking advice, ecology, history and explicit spiritual/metaphysical framing.",
      "Instructional sections should sound practical and natural in Greek, especially fermentation, kefir, meat stock and meal preparation.",
      "Strong claims should remain strong when the source is categorical, while clearly remaining the speaker's claims rather than narrator-verified facts."
    ],
    fidelityRules: [
      "Preserve uncertainty, hedging and degree of confidence exactly.",
      "Preserve negation, agency, causality and who is attributing each claim.",
      "Do not turn association into causation or a possibility into a fact.",
      "Use global context to disambiguate meaning, never to add information absent from the current source cue.",
      "Keep numbers, doses, units, names, acronyms and technical tokens faithful to the source.",
      "Maintain consistent Greek terminology for GAPS, microbiome, fermentation, meat stock, bone broth and related technical terms across all cues.",
      "Correct an obvious ASR error only when the surrounding transcript makes the intended wording unambiguous; otherwise preserve ambiguity.",
      "Keep the post-outro teaser semantically separate from the main interview and preserve timestamps one-to-one with the repaired English cues."
    ],
    generatedAt: new Date().toISOString(),
  };

  await put(`transcripts/v${TRANSCRIPT_VERSION}/context/${VIDEO_ID}.json`, JSON.stringify(understanding), {
    access: "public" as const,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 300,
    contentType: "application/json; charset=utf-8",
  });

  return NextResponse.json({
    written: true,
    videoId: VIDEO_ID,
    transcriptVersion: TRANSCRIPT_VERSION,
    cueCount: EXPECTED_CUE_COUNT,
    sourceHash: EXPECTED_SOURCE_HASH,
  }, { headers: { "Cache-Control": "no-store" } });
}
