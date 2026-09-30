/** Đọc cài đặt phim toàn cục của dự án: ưu tiên `params` của dự án, sau đó lùi về giá trị lịch sử của tập */
import {
  readEpisodeCharacterIntroMode,
  type DramaCharacterIntroMode,
} from './dramaCharacterIntro'
import { readEpisodeSubtitleMode, type DramaSubtitleMode } from './dramaSubtitleBoard'

/** Cách đặt phụ đề đang dùng: ưu tiên cấu hình toàn cục của dự án, sau đó lùi về giá trị lịch sử của tập */
export function readEffectiveSubtitleMode(
  episodeParams?: Record<string, unknown> | null,
  projectParams?: Record<string, unknown> | null,
): DramaSubtitleMode {
  const fromProject = projectParams?.subtitleMode
  if (fromProject === 'model' || fromProject === 'post') return fromProject
  return readEpisodeSubtitleMode(episodeParams)
}

/** Phần giới thiệu nhân vật đang dùng: ưu tiên cấu hình toàn cục của dự án, sau đó lùi về giá trị lịch sử của tập */
export function readEffectiveCharacterIntroMode(
  episodeParams?: Record<string, unknown> | null,
  projectParams?: Record<string, unknown> | null,
): DramaCharacterIntroMode {
  const fromProject = projectParams?.characterIntroMode
  if (fromProject === 'model' || fromProject === 'off') return fromProject
  return readEpisodeCharacterIntroMode(episodeParams)
}
