const fs = require('fs');
const path = require('path');

const DEFAULT_CAREER_PROFILE = {
  version: 1,
  completed: false,
  major: '',
  industries: '',
  roles: '',
  priorities: '',
  strengths: ''
};

function normalizeCareerProfile(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('プロフィールデータが不正です');
  }
  
  if (value.version !== 1) {
    throw new Error('対応していないプロフィールのバージョンです');
  }
  
  if (typeof value.completed !== 'boolean') {
    throw new Error('完了ステータスが不正です');
  }
  
  const extract = (field, fieldName) => {
    if (field === undefined) return '';
    if (typeof field !== 'string') throw new Error(`${fieldName}は文字列である必要があります`);
    const trimmed = field.trim();
    if (trimmed.length > 2000) throw new Error(`${fieldName}は2000文字以内で入力してください`);
    return trimmed;
  };

  return {
    version: 1,
    completed: value.completed,
    major: extract(value.major, '専攻'),
    industries: extract(value.industries, '志望業界'),
    roles: extract(value.roles, '希望職種'),
    priorities: extract(value.priorities, '就活の軸・優先度'),
    strengths: extract(value.strengths, '強み・経験')
  };
}

class CareerProfileStore {
  constructor(userDataPath) {
    if (!userDataPath) {
      throw new Error('userDataPath is required');
    }
    this.filePath = path.join(userDataPath, 'career-profile.json');
  }

  getProfile() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return DEFAULT_CAREER_PROFILE;
      }
      const data = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return normalizeCareerProfile(parsed);
    } catch (error) {
      if (error.name === 'SyntaxError') {
        throw new Error('プロフィールデータが破損しています');
      }
      throw new Error('プロフィールデータの読み込みに失敗しました');
    }
  }

  saveProfile(profile) {
    const normalized = normalizeCareerProfile(profile);
    const jsonStr = JSON.stringify(normalized);
    const tempPath = path.join(path.dirname(this.filePath), `career-profile.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`);
    
    try {
      fs.writeFileSync(tempPath, jsonStr, { mode: 0o600, encoding: 'utf-8' });
      fs.renameSync(tempPath, this.filePath);
      return normalized;
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (e) {
        // ignore cleanup error
      }
      throw new Error('プロフィールの保存に失敗しました');
    }
  }
}

module.exports = {
  DEFAULT_CAREER_PROFILE,
  normalizeCareerProfile,
  CareerProfileStore
};
