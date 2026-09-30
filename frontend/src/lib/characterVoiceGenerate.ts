/** AI tạo giọng đọc theo thiết lập của nhân vật rồi gắn vào `voiceAudio` (không hiện hộp thoại, dùng cho nút một chạm trên thẻ) */
import { dramaApi, type DramaAsset } from '../api/drama'
import { buildBoundParams } from '../pages/drama/CharacterVoiceBindModal'

export type CharacterVoiceGenerateResult = {
  character: DramaAsset
  voice: DramaAsset
}

// Sinh mô tả giọng từ hồ sơ nhân vật, tổng hợp bản nghe thử rồi ghi lại vào liên kết
export async function generateAndBindCharacterVoice(
  projectId: number,
  asset: DramaAsset,
): Promise<CharacterVoiceGenerateResult> {
  const promptResult = await dramaApi.suggestVoicePrompt({
    project_id: projectId,
    asset_id: asset.id,
  })
  const voicePrompt = (promptResult.voice_prompt || '').trim()
  if (!voicePrompt) {
    throw new Error('Mô tả giọng đọc bị trống')
  }

  const voiceResult = await dramaApi.generateVoice({
    project_id: projectId,
    name: `Giọng ${asset.name || 'nhân vật'}`,
    voice_prompt: voicePrompt,
    speaker: promptResult.speaker || undefined,
    sample_text: promptResult.sample_text || undefined,
    character_asset_id: asset.id,
  })
  const voice = voiceResult.asset
  if (!voice?.url) {
    throw new Error('Tổng hợp giọng đọc thất bại')
  }

  const character = await dramaApi.updateAsset(asset.id, {
    params: buildBoundParams(asset, voice),
  })
  return { character, voice }
}
