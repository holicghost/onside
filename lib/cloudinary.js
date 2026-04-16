const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dchonv5ri';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'e6sqsjlo';

export const uploadImage = async (file) => {
  if (!file) throw new Error('파일이 없습니다.');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const res = await fetch(url, { method: 'POST', body: formData });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `이미지 업로드 실패 (${res.status})`);
  }

  const data = await res.json();
  return data.secure_url;
};
