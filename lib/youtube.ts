
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY

export class YouTubeAPI {
  static async getVideoInfo(videoUrl: string) {
    try {
      // Extract Video ID from the URL
      const videoId = YouTubeAPI.extractVideoId(videoUrl)
      if (!videoId) {
        throw new Error("Invalid YouTube URL")
      }

      // Fetch video details from YouTube API
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`
      )

      const data = await response.json()

      if (!data.items || data.items.length === 0) {
        throw new Error("Video not found")
      }

      const video = data.items[0]
      return {
        create_time: new Date(video.snippet.publishedAt).getTime() / 1000, // Convert to UNIX timestamp
        views: parseInt(video.statistics.viewCount, 10),
      }
    } catch (error) {
      console.error("Error fetching YouTube video info:", error)
      return null
    }
  }

  static extractVideoId(url: string): string | null {
    const regex =
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const match = url.match(regex)
    return match ? match[1] : null
  }
}
