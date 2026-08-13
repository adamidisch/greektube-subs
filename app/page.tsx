import GreekTubePlayer from "./GreekTubePlayer";
import CueEditEnhancer from "./CueEditEnhancer";
import PlayerUXEnhancer from "./PlayerUXEnhancer";

export default function Home() {
  return (
    <>
      <GreekTubePlayer />
      <CueEditEnhancer />
      <PlayerUXEnhancer />
    </>
  );
}
