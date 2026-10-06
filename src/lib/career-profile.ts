export interface CareerProfile {
  version: 1;
  completed: boolean;
  major: string;
  industries: string;
  roles: string;
  priorities: string;
  strengths: string;
}

export const DEFAULT_CAREER_PROFILE: CareerProfile = {
  version: 1,
  completed: false,
  major: '',
  industries: '',
  roles: '',
  priorities: '',
  strengths: ''
};

export function normalizeCareerProfile(value: unknown): CareerProfile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('プロフィールデータが不正です');
  }
  
  const obj = value as Record<string, unknown>;
  
  if (obj.version !== 1) {
    throw new Error('対応していないプロフィールのバージョンです');
  }
  
  if (typeof obj.completed !== 'boolean') {
    throw new Error('完了ステータスが不正です');
  }
  
  const extract = (field: unknown, fieldName: string): string => {
    if (field === undefined) return '';
    if (typeof field !== 'string') {
      throw new Error(`${fieldName}は文字列である必要があります`);
    }
    const trimmed = field.trim();
    if (trimmed.length > 2000) throw new Error(`${fieldName}は2000文字以内で入力してください`);
    return trimmed;
  };

  return {
    version: 1,
    completed: obj.completed,
    major: extract(obj.major, '専攻'),
    industries: extract(obj.industries, '志望業界'),
    roles: extract(obj.roles, '希望職種'),
    priorities: extract(obj.priorities, '就活の軸・優先度'),
    strengths: extract(obj.strengths, '強み・経験')
  };
}
