from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)


# Player: two-line readable subtitle frames + transcript cache v6 + release label.
player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text()

subtitle_pattern = re.compile(
    r"function subtitleParts\(text:string,maxCharacters=76\)\{.*?\n\}\nfunction subtitleWindow\(cue:Cue\|undefined,currentTime:number\)\{.*?\n\}\n(?=function isCompleteGreekTranscript)",
    re.S,
)
subtitle_replacement = r'''function subtitleFrames(text:string,maxLineCharacters=42){
  const clean=text.replace(/\s+/g," ").trim();
  if(!clean)return [];
  const words=clean.split(" ");
  const lines:string[]=[];
  let line="";
  for(const word of words){
    const next=line?`${line} ${word}`:word;
    if(line&&next.length>maxLineCharacters){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);

  // Avoid a tiny orphan line at the end when the previous line has room to share.
  if(lines.length>=3&&lines.length%2===1&&lines[lines.length-1].length<24){
    const previous=lines[lines.length-2].split(" ");
    let last=lines[lines.length-1];
    while(previous.length>2&&last.length<28){
      const moved=previous.pop();
      if(!moved)break;
      last=`${moved} ${last}`;
    }
    lines[lines.length-2]=previous.join(" ");
    lines[lines.length-1]=last;
  }

  const frames:string[]=[];
  for(let index=0;index<lines.length;index+=2){
    frames.push(lines.slice(index,index+2).join("\n"));
  }
  return frames;
}
function subtitleWindow(cue:Cue|undefined,currentTime:number){
  if(!cue)return "";
  const frames=subtitleFrames(cue.text);
  if(frames.length<=1)return frames[0]||"";

  const duration=Math.max(.1,cue.duration);
  const elapsed=Math.max(0,Math.min(duration-.001,currentTime-cue.start));
  const minReadable=duration>=frames.length*1.35?1.35:duration/frames.length;
  const remaining=Math.max(0,duration-minReadable*frames.length);
  const weights=frames.map(frame=>Math.max(1,frame.replace(/\s/g,"").length));
  const totalWeight=weights.reduce((sum,weight)=>sum+weight,0)||1;
  let boundary=0;
  for(let index=0;index<frames.length;index++){
    boundary+=minReadable+(remaining*weights[index]/totalWeight);
    if(elapsed<boundary||index===frames.length-1)return frames[index];
  }
  return frames[frames.length-1];
}
'''
player, count = subtitle_pattern.subn(lambda _: subtitle_replacement, player, count=1)
if count != 1:
    raise SystemExit(f"subtitle compositor: expected 1 block, found {count}")

player = replace_once(player, "data.transcriptVersion!==5", "data.transcriptVersion!==6", "client transcript version")
cache_count = player.count(":v5`")
if cache_count < 1:
    raise SystemExit("localStorage v5 cache keys not found")
player = player.replace(":v5`", ":v6`")
player = replace_once(player, '<small className="brand-version">ver 7.1</small>', '<small className="brand-version">ver 7.1.2</small>', "brand version")
player_path.write_text(player)


# Server: strict cue-preserving Groq translation and transcript version v6.
route_path = Path("app/api/captions/route.ts")
route = route_path.read_text()

prompt_pattern = re.compile(r'const GROQ_SYSTEM_PROMPT =\n.*?;\n\n(?=async function translateBatchWithGroq)', re.S)
prompt_replacement = '''const GROQ_SYSTEM_PROMPT =
  "Μετέφρασε φυσικά στα ελληνικά για υπότιτλους. " +
  "Κάθε δείκτης [[N]] είναι ανεξάρτητο timed cue και πρέπει να παραμείνει δεμένος με το δικό του χρονικό σημείο. " +
  "Μετέφρασε ΜΟΝΟ τις λέξεις που υπάρχουν μετά από κάθε [[N]] μέχρι τον επόμενο δείκτη. " +
  "Μην μεταφέρεις, ολοκληρώνεις ή δανείζεσαι λέξεις και νόημα από γειτονικό cue, ακόμη και αν μια πρόταση κόβεται στη μέση. " +
  "Διατήρησε πιστά το νόημα και την ιατρική ή επιστημονική ορολογία, με φυσικά ελληνικά αντί για κατά λέξη απόδοση. " +
  "Χρησιμοποίησε συνεπή ορολογία σε όλα τα cues και αφαίρεσε μόνο προφανή λεκτικά fillers όπως um, uh, hmm, χμ και εε. " +
  "Μην προσθέτεις πληροφορίες που δεν υπάρχουν στο πρωτότυπο. " +
  "Επέστρεψε ακριβώς έναν δείκτη [[N]] για κάθε input cue, στην ίδια σειρά, χωρίς παραλείψεις, διπλασιασμούς ή νέους δείκτες. " +
  "Απάντησε ΜΟΝΟ με τις μεταφρασμένες γραμμές και τους δείκτες, χωρίς εισαγωγή, σχόλια ή εξηγήσεις.";

'''
route, count = prompt_pattern.subn(lambda _: prompt_replacement, route, count=1)
if count != 1:
    raise SystemExit(f"Groq prompt: expected 1 block, found {count}")

function_pattern = re.compile(r'async function translateBatchWithGroq\(batch: \{ index: number; text: string \}\[], precedingContext\?: string\) \{.*?\n\}\n\n(?=async function translateText)', re.S)
function_replacement = r'''async function translateBatchWithGroq(batch: { index: number; text: string }[], precedingContext?: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const expectedIds = new Set(batch.map(item => item.index));
  const numbered = batch.map(item => `[[${item.index}]] ${item.text}`).join("\n");
  const userContent = precedingContext
    ? `Προηγούμενες μεταφρασμένες γραμμές μόνο για ορολογία και ύφος. ΜΗΝ τις μεταφράσεις ξανά και ΜΗΝ μεταφέρεις λέξεις από αυτές στα νέα cues:\n${precedingContext}\n\nΝέα timed cues προς μετάφραση. Κάθε cue μένει αυστηρά στο δικό του [[N]]:\n${numbered}`
    : `Timed cues προς μετάφραση. Κάθε cue μένει αυστηρά στο δικό του [[N]]:\n${numbered}`;
  const removeMarkerArtifacts = (value: string) => value.replace(/\[{1,2}\s*(\d+)\s*\]{1,2}/g, (full, rawId) =>
    expectedIds.has(Number(rawId)) ? "" : full,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.1,
          max_tokens: 4000,
          messages: [
            { role: "system", content: GROQ_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
      });
    } catch (error) {
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      throw error;
    }

    if (response.status === 429) {
      if (attempt < 2) {
        const retryAfterSeconds = Number(response.headers.get("retry-after")) || 5;
        const waitMs = Math.min(retryAfterSeconds, 20) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw new Error("Groq 429 after retries");
    }
    if (!response.ok) {
      if (response.status >= 500 && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      throw new Error(`Groq ${response.status}`);
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      if (attempt < 2) continue;
      throw new Error("Groq response empty");
    }

    const results = new Map<number, string>();
    const marker = /\[\[\s*(\d+)\s*\]\]\s*([\s\S]*?)(?=\n?\[\[\s*\d+\s*\]\]|$)/g;
    let match: RegExpExecArray | null;
    let invalidMapping = false;
    while ((match = marker.exec(content))) {
      const index = Number(match[1]);
      if (!expectedIds.has(index) || results.has(index)) {
        invalidMapping = true;
        break;
      }
      const text = cleanSubtitleText(removeMarkerArtifacts(match[2]));
      if (!text) {
        invalidMapping = true;
        break;
      }
      results.set(index, text);
    }

    const completeMapping = !invalidMapping &&
      results.size === batch.length &&
      batch.every(item => results.has(item.index));
    if (completeMapping) return results;

    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
      continue;
    }
    throw new Error("Groq cue mapping invalid");
  }
  return null;
}

'''
route, count = function_pattern.subn(lambda _: function_replacement, route, count=1)
if count != 1:
    raise SystemExit(f"Groq function: expected 1 block, found {count}")

route = replace_once(route, "const batchSize = useGroq ? 32 : 25;", "const batchSize = useGroq ? 8 : 25;", "Groq batch size")
route = route.replace("supadata_native_contextual_meaning_units_v3", "supadata_native_contextual_meaning_units_v4")
route_path.write_text(route)


cache_path = Path("app/api/shared-cache.ts")
cache = cache_path.read_text()
cache = replace_once(cache, "export const TRANSCRIPT_VERSION = 5;", "export const TRANSCRIPT_VERSION = 6;", "server transcript version")
cache_path.write_text(cache)


# Subtitle line breaks need to render as real lines.
css_path = Path("app/globals.css")
css = css_path.read_text()
old_css = ".subtitles{position:absolute;left:7%;right:7%;z-index:3;margin:auto;width:max-content;max-width:86%;padding:5px 9px;border-radius:5px;color:white;text-align:center;line-height:1.4;font-weight:620;pointer-events:none}"
new_css = ".subtitles{position:absolute;left:7%;right:7%;z-index:3;margin:auto;width:max-content;max-width:86%;padding:5px 9px;border-radius:5px;color:white;text-align:center;line-height:1.4;font-weight:620;white-space:pre-line;text-wrap:balance;pointer-events:none}"
css = replace_once(css, old_css, new_css, "subtitle CSS")
css_path.write_text(css)


layout_path = Path("app/layout.tsx")
layout = layout_path.read_text()
layout = replace_once(layout, '"codex-preview": "final-v7",', '"codex-preview": "final-v7.1.2",', "preview metadata")
layout = replace_once(layout, '"app-version": "7.1.0",', '"app-version": "7.1.2",', "app metadata version")
layout_path.write_text(layout)


package_path = Path("package.json")
package = package_path.read_text()
package = replace_once(package, '"version": "7.1.0"', '"version": "7.1.2"', "package version")
package_path.write_text(package)

print("Applied GreekTube Subs v7.1.2 subtitle mapping/readability changes")
