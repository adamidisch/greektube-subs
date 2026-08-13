import GreekTubePlayer from "./GreekTubePlayer";
import CueEditEnhancer from "./CueEditEnhancer";
import PlayerUXEnhancer from "./PlayerUXEnhancer";
import FullscreenExitEnhancer from "./FullscreenExitEnhancer";

export default function Home() {
  return (
    <>
      <GreekTubePlayer />
      <CueEditEnhancer />
      <PlayerUXEnhancer />
      <FullscreenExitEnhancer />
    </>
  );
}
