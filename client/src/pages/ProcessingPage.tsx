import { useProjectStore } from "@/store/projectStore";
import "./ProcessingPage.css";

export default function ProcessingPage() {
  const { clips } = useProjectStore();

  // TODO: Subscribe to job progress via WebSocket
  // TODO: Show step-by-step progress (analyzing -> grading -> complete)
  // => in progress
  // TODO: Per-clip progress indicators
  // => in progress
  // TODO: Navigate to export when complete
  const clipItems =
    clips.length > 0
      ? clips.map((clip) => ({
          id: clip.id,
          title: clip.file_name || "Untitled clip",
          progress: 40,
          status: "Analyzing",
        }))
      : [
          // example clips
          // analyzing -> grading -> complete
          {
            id: "1",
            title: "test_clips.mp4",
            progress: 80,
            status: "Analyzing",
          },
          {
            id: "2",
            title: "test_clips.mov",
            progress: 50,
            status: "Analyzing",
          },
        ];

  // Overall Progress
  const overallProgress =
    clipItems.length > 0
      ? Math.round(
          clipItems.reduce((total, clip) => total + clip.progress, 0) /
            clipItems.length,
        )
      : 0;
  // Completed Clips
  const completedClips = clipItems.filter(
    (clip) => clip.progress >= 100,
  ).length;

  return (
    <section className="processing-page">
      <div className="processing-page__grid">
        <div className="processing-page__column">
          <div className="processing-card processing-overview">
            <div className="processing-overview__header">
              <div>
                <p className="processing-overview__eyebrow">Overall progress</p>
                <h2 className="processing-overview__value">
                  {overallProgress}%
                </h2>
              </div>
              <div className="processing-overview__meta">
                <span>
                  {completedClips} of {clipItems.length} clips complete
                </span>
              </div>
            </div>

            <div className="processing-overview__progress">
              <div
                className="processing-overview__progress-bar"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          <div className="processing-card">
            <div className="processing-card__header">
              <div>
                <h2 className="processing-card__title">Clip queue</h2>
                <p className="processing-card__subtitle">
                  The progress for each clip is displayed.
                </p>
              </div>
            </div>

            <div className="processing-clip-list">
              {clipItems.map((clip) => (
                <article key={clip.id} className="processing-clip-card">
                  <div className="processing-clip-card__header">
                    <div className="processing-clip-card__meta">
                      <p className="processing-clip-card__title">
                        {clip.title}
                      </p>
                    </div>
                    <span className="processing-clip-card__status">
                      {clip.status}
                    </span>
                  </div>

                  <div className="processing-clip-card__progress">
                    <div
                      className="processing-clip-card__progress-bar"
                      style={{ width: `${clip.progress}%` }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
