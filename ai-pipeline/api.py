from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ClipVibe AI Pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze_clip():
    """Analyze a video clip's visual properties (brightness, colors, contrast)."""
    # TODO: Download clip from Supabase Storage
    # TODO: Extract frames with OpenCV
    # TODO: Compute brightness, dominant colors, contrast
    # TODO: Return ClipAnalysis
    return {"error": "Not implemented"}


@app.post("/grade")
async def grade_clip():
    """Apply FFmpeg color grading filters to a clip."""
    # TODO: Receive clip path + FFmpeg filter params
    # TODO: Run FFmpeg with color grading filters
    # TODO: Upload graded clip to Supabase Storage
    # TODO: Return output path
    return {"error": "Not implemented"}
