import { SportNiche } from '@prisma/client';

export interface NicheQuestionTemplate {
  key: string;
  question: string;
  type: 'TEXT' | 'TEXTAREA' | 'SELECT' | 'MULTISELECT' | 'NUMBER' | 'TIME' | 'DATE' | 'SCALE' | 'BOOLEAN';
  options?: string[];
  required: boolean;
  placeholder?: string;
  aiHint?: string;
  order: number;
}

export interface NicheZoneConfig {
  label: string;
  unit: string;
  zones: {
    name: string;
    description: string;
    min?: number;
    max?: number;
  }[];
}

export interface NichePricing {
  monthly: { label: string; priceInCents: number; features: string[] };
  quarterly: { label: string; priceInCents: number; features: string[] };
  annual: { label: string; priceInCents: number; features: string[] };
}

export interface NicheConfig {
  key: SportNiche;
  label: string;
  icon: string;
  description: string;
  color: string;
  primaryMetric: string;
  workoutTypes: string[];
  zoneConfig: NicheZoneConfig;
  questionTemplates: NicheQuestionTemplate[];
  pricing: NichePricing;
  integrations: string[];
  features: string[];
}

// ─── RUNNING ─────────────────────────────────────────────────────────────────

const RUNNING_QUESTIONS: NicheQuestionTemplate[] = [
  { order: 1, key: 'activity_frequency', question: 'Costuma fazer atividade física? Com que frequência por semana?', type: 'SELECT', options: ['Nunca', '1-2x', '3-4x', '5x+'], required: true },
  { order: 2, key: 'other_sports', question: 'Pratica algum esporte além de corrida?', type: 'TEXT', required: false },
  { order: 3, key: 'running_experience', question: 'Já corre? Se sim, há quanto tempo?', type: 'SELECT', options: ['Não corro', '< 6 meses', '6m-1 ano', '1-3 anos', '3+ anos'], required: true },
  { order: 4, key: 'goal', question: 'Objetivo principal', type: 'SELECT', options: ['5K', '10K', '21K', '42K', 'Perder peso', 'Saúde geral', 'Condicionamento'], required: true },
  { order: 5, key: 'injury_history', question: 'Já teve alguma lesão correndo? Se sim, qual e quando?', type: 'TEXTAREA', required: false },
  { order: 6, key: 'medical_restrictions', question: 'Possui algum problema cardíaco ou restrição médica?', type: 'TEXTAREA', required: false },
  { order: 7, key: 'training_days', question: 'Quantos dias por semana você tem disponível para treinar?', type: 'SELECT', options: ['2', '3', '4', '5', '6'], required: true },
  { order: 8, key: 'preferred_time', question: 'Qual horário você prefere treinar?', type: 'SELECT', options: ['Manhã', 'Tarde', 'Noite', 'Flexível'], required: true },
  { order: 9, key: 'terrain', question: 'Prefere esteira ou rua?', type: 'SELECT', options: ['Esteira', 'Rua', 'Trilha', 'Indiferente'], required: false },
  { order: 10, key: 'gps_watch', question: 'Possui relógio GPS?', type: 'SELECT', options: ['Garmin', 'Polar', 'Apple Watch', 'Coros', 'Outro', 'Não tenho'], required: false },
  { order: 11, key: 'best_5k', question: 'Qual seu melhor tempo nos 5km?', type: 'TIME', placeholder: 'ex: 25:30', required: false, aiHint: 'Tempo em mm:ss para calcular VDOT e zonas de pace' },
  { order: 12, key: 'best_10k', question: 'Qual seu melhor tempo nos 10km?', type: 'TIME', placeholder: 'ex: 55:00', required: false },
  { order: 13, key: 'next_race', question: 'Tem alguma prova em vista? Qual e quando?', type: 'TEXT', required: false },
  { order: 14, key: 'weekly_km', question: 'Quantos km você corre por semana atualmente?', type: 'NUMBER', placeholder: 'ex: 25', required: false },
  { order: 15, key: 'sleep_hours', question: 'Quantas horas de sono você dorme em média?', type: 'SELECT', options: ['< 5h', '5-6h', '6-7h', '7-8h', '8h+'], required: false },
  { order: 16, key: 'stress_level', question: 'Como avalia seu nível de estresse no dia a dia?', type: 'SCALE', required: false },
  { order: 17, key: 'previous_coaching', question: 'Já usou assessoria de corrida antes? O que funcionou / não funcionou?', type: 'TEXTAREA', required: false },
  { order: 18, key: 'referral', question: 'Como soube da assessoria?', type: 'SELECT', options: ['WhatsApp (indicação)', 'Instagram', 'Facebook', 'Google', 'Amigo', 'Outro'], required: false },
];

// ─── CYCLING ─────────────────────────────────────────────────────────────────

const CYCLING_QUESTIONS: NicheQuestionTemplate[] = [
  { order: 1, key: 'cycling_experience', question: 'Há quanto tempo você pedala?', type: 'SELECT', options: ['Iniciante (< 1 ano)', '1-3 anos', '3-5 anos', '5+ anos'], required: true },
  { order: 2, key: 'bike_type', question: 'Qual tipo de bicicleta você usa?', type: 'SELECT', options: ['Speed (road)', 'MTB', 'Gravel', 'Triathlon/TT', 'Indoor/Spinning', 'Mais de um tipo'], required: true },
  { order: 3, key: 'has_power_meter', question: 'Você tem medidor de potência (wattímetro)?', type: 'SELECT', options: ['Sim, nos pedais', 'Sim, no pedivela', 'Sim, no cubo', 'Não tenho'], required: true, aiHint: 'Se sim, usar treinos baseados em watts/FTP' },
  { order: 4, key: 'ftp', question: 'Qual seu FTP atual (watts)? Se não souber, deixe em branco.', type: 'NUMBER', placeholder: 'ex: 220', required: false, aiHint: 'FTP = Functional Threshold Power. Base para zonas de treino' },
  { order: 5, key: 'ftp_per_kg', question: 'Qual seu peso corporal (kg)? (para calcular W/kg)', type: 'NUMBER', placeholder: 'ex: 70', required: true },
  { order: 6, key: 'best_20min_power', question: 'Qual sua melhor potência em 20 minutos (watts)?', type: 'NUMBER', placeholder: 'ex: 260', required: false, aiHint: 'FTP ≈ 95% do melhor 20 min' },
  { order: 7, key: 'training_hours', question: 'Quantas horas por semana você pedala atualmente?', type: 'SELECT', options: ['< 3h', '3-5h', '5-8h', '8-12h', '12h+'], required: true },
  { order: 8, key: 'goal', question: 'Objetivo principal', type: 'SELECT', options: ['Gran Fondo', 'Prova de XCO (MTB)', 'Triathlon', 'Ciclismo urbano', 'Performance/competição', 'Saúde e condicionamento', 'Emagrecimento'], required: true },
  { order: 9, key: 'next_event', question: 'Tem alguma prova ou evento em vista? Qual e quando?', type: 'TEXT', required: false },
  { order: 10, key: 'smart_trainer', question: 'Tem smart trainer para treino indoor?', type: 'SELECT', options: ['Sim (rodinho)', 'Sim (direto/direct drive)', 'Treino apenas outdoor', 'Não tenho'], required: false },
  { order: 11, key: 'gps_device', question: 'Que ciclocomputador/GPS você usa?', type: 'SELECT', options: ['Garmin', 'Wahoo', 'Polar', 'Apple Watch', 'Coros', 'Celular', 'Nenhum'], required: false },
  { order: 12, key: 'injury_history', question: 'Já teve alguma lesão relacionada ao ciclismo?', type: 'TEXTAREA', required: false },
  { order: 13, key: 'training_days', question: 'Quantos dias por semana você tem disponível para treinar?', type: 'SELECT', options: ['2', '3', '4', '5', '6'], required: true },
  { order: 14, key: 'medical_restrictions', question: 'Possui algum problema cardíaco ou restrição médica?', type: 'TEXTAREA', required: false },
  { order: 15, key: 'referral', question: 'Como soube da assessoria?', type: 'SELECT', options: ['WhatsApp (indicação)', 'Instagram', 'Strava', 'Google', 'Amigo', 'Outro'], required: false },
];

// ─── TRIATHLON ────────────────────────────────────────────────────────────────

const TRIATHLON_QUESTIONS: NicheQuestionTemplate[] = [
  { order: 1, key: 'triathlon_experience', question: 'Já completou algum triathlon?', type: 'SELECT', options: ['Nunca fiz', 'Sprint', 'Olímpico', 'Half Iron (70.3)', 'Iron (140.6)', 'Múltiplas distâncias'], required: true },
  { order: 2, key: 'weakest_sport', question: 'Qual das 3 modalidades é sua maior dificuldade?', type: 'SELECT', options: ['Natação', 'Ciclismo', 'Corrida'], required: true },
  { order: 3, key: 'swim_100m_pace', question: 'Qual seu pace de natação por 100m (piscina)?', type: 'TIME', placeholder: 'ex: 1:45', required: false, aiHint: 'Pace em min:ss para cálculo de zonas de natação' },
  { order: 4, key: 'ftp', question: 'Qual seu FTP no ciclismo (watts)? Deixe em branco se não souber.', type: 'NUMBER', placeholder: 'ex: 220', required: false },
  { order: 5, key: 'best_10k_run', question: 'Qual seu melhor tempo nos 10km de corrida?', type: 'TIME', placeholder: 'ex: 55:00', required: false },
  { order: 6, key: 'goal_distance', question: 'Qual distância você quer conquistar/melhorar?', type: 'SELECT', options: ['Sprint (750m/20km/5km)', 'Olímpico (1.5km/40km/10km)', 'Half Iron 70.3', 'Iron 140.6', 'Multiesportivo geral'], required: true },
  { order: 7, key: 'next_race', question: 'Tem alguma prova em vista? Qual e quando?', type: 'TEXT', required: false },
  { order: 8, key: 'has_power_meter', question: 'Tem medidor de potência no bike?', type: 'SELECT', options: ['Sim', 'Não'], required: false },
  { order: 9, key: 'pool_access', question: 'Tem acesso à piscina para treinar?', type: 'SELECT', options: ['Piscina coberta (clube/academia)', 'Lago/mar (água aberta)', 'Ambos', 'Dificuldade de acesso'], required: true },
  { order: 10, key: 'training_hours', question: 'Quantas horas por semana você consegue treinar?', type: 'SELECT', options: ['< 6h', '6-10h', '10-15h', '15-20h', '20h+'], required: true },
  { order: 11, key: 'weight', question: 'Peso atual (kg)', type: 'NUMBER', required: true },
  { order: 12, key: 'injury_history', question: 'Já teve alguma lesão nas 3 modalidades?', type: 'TEXTAREA', required: false },
  { order: 13, key: 'medical_restrictions', question: 'Possui algum problema cardíaco ou restrição médica?', type: 'TEXTAREA', required: false },
  { order: 14, key: 'devices', question: 'Que dispositivos você usa para monitorar treino?', type: 'MULTISELECT', options: ['Garmin', 'Polar', 'Apple Watch', 'Coros', 'Wahoo', 'Ciclocomputador Garmin', 'Nenhum'], required: false },
  { order: 15, key: 'referral', question: 'Como soube da assessoria?', type: 'SELECT', options: ['WhatsApp (indicação)', 'Instagram', 'Strava', 'Google', 'Amigo', 'Outro'], required: false },
];

// ─── SWIMMING ─────────────────────────────────────────────────────────────────

const SWIMMING_QUESTIONS: NicheQuestionTemplate[] = [
  { order: 1, key: 'swim_experience', question: 'Há quanto tempo você nada regularmente?', type: 'SELECT', options: ['Iniciante (< 1 ano)', '1-3 anos', '3-5 anos', '5+ anos', 'Ex-nadador/retorno'], required: true },
  { order: 2, key: 'swim_style', question: 'Quais estilos você nada?', type: 'MULTISELECT', options: ['Crawl/Livre', 'Costas', 'Peito', 'Borboleta', 'Todos os estilos'], required: true },
  { order: 3, key: 'pool_length', question: 'Em qual tamanho de piscina você treina?', type: 'SELECT', options: ['25m', '50m', 'Água aberta', 'Piscina privada (outro tamanho)'], required: true },
  { order: 4, key: 'best_100m', question: 'Qual seu melhor tempo nos 100m crawl?', type: 'TIME', placeholder: 'ex: 1:15', required: false, aiHint: 'Referência para CSS (Critical Swim Speed) e zonas' },
  { order: 5, key: 'best_400m', question: 'Qual seu tempo nos 400m crawl?', type: 'TIME', placeholder: 'ex: 6:00', required: false, aiHint: 'Usado para calcular o CSS (pace limiar anaeróbio)' },
  { order: 6, key: 'weekly_meters', question: 'Quantos metros você nada por semana atualmente?', type: 'SELECT', options: ['< 5.000m', '5.000-10.000m', '10.000-20.000m', '20.000m+'], required: true },
  { order: 7, key: 'sessions_per_week', question: 'Quantas sessões de natação por semana?', type: 'SELECT', options: ['1-2x', '3-4x', '5-6x', 'Diário'], required: true },
  { order: 8, key: 'goal', question: 'Objetivo principal', type: 'SELECT', options: ['Melhorar técnica', 'Prova de piscina', 'Água aberta/maratona aquática', 'Triathlon', 'Condicionamento físico', 'Reabilitação'], required: true },
  { order: 9, key: 'next_race', question: 'Tem alguma prova em vista? Qual e quando?', type: 'TEXT', required: false },
  { order: 10, key: 'has_equipment', question: 'Que equipamentos você usa?', type: 'MULTISELECT', options: ['Palmar', 'Pull buoy', 'Prancha', 'Faixa elástica', 'Tubo de arrasto', 'Barbatanas', 'Óculos de treino', 'Relógio aquático'], required: false },
  { order: 11, key: 'swim_watch', question: 'Usa relógio para registrar treinos?', type: 'SELECT', options: ['Garmin (aquático)', 'Apple Watch', 'Polar', 'Coros', 'Suunto', 'Não uso'], required: false },
  { order: 12, key: 'weight', question: 'Peso atual (kg)', type: 'NUMBER', required: true },
  { order: 13, key: 'injury_history', question: 'Já teve alguma lesão de ombro ou relacionada à natação?', type: 'TEXTAREA', required: false },
  { order: 14, key: 'medical_restrictions', question: 'Possui algum problema cardíaco ou restrição médica?', type: 'TEXTAREA', required: false },
  { order: 15, key: 'referral', question: 'Como soube da assessoria?', type: 'SELECT', options: ['WhatsApp (indicação)', 'Instagram', 'Google', 'Amigo', 'Outro'], required: false },
];

// ─── CROSSFIT ─────────────────────────────────────────────────────────────────

const CROSSFIT_QUESTIONS: NicheQuestionTemplate[] = [
  { order: 1, key: 'cf_experience', question: 'Há quanto tempo você pratica CrossFit?', type: 'SELECT', options: ['Iniciante (< 6 meses)', '6m-1 ano', '1-3 anos', '3+ anos'], required: true },
  { order: 2, key: 'cf_box', question: 'Você treina em box afiliado ou em home gym?', type: 'SELECT', options: ['Box afiliado', 'Home gym', 'Academia convencional', 'Ambos'], required: true },
  { order: 3, key: 'max_back_squat', question: 'Qual seu 1RM no Back Squat (kg)? (Deixe em branco se não souber)', type: 'NUMBER', placeholder: 'ex: 100', required: false, aiHint: 'Referência de força para programação de treino' },
  { order: 4, key: 'max_deadlift', question: 'Qual seu 1RM no Deadlift (kg)?', type: 'NUMBER', placeholder: 'ex: 120', required: false },
  { order: 5, key: 'max_clean_jerk', question: 'Qual seu 1RM no Clean & Jerk (kg)?', type: 'NUMBER', placeholder: 'ex: 80', required: false },
  { order: 6, key: 'max_snatch', question: 'Qual seu 1RM no Snatch (kg)?', type: 'NUMBER', placeholder: 'ex: 60', required: false },
  { order: 7, key: 'gymnastics_level', question: 'Como está seu nível de ginástica (movimentos como muscle-up, handstand)?', type: 'SELECT', options: ['Iniciante (sem pull-up ainda)', 'Básico (pull-up, ring row)', 'Intermediário (muscle-up, HSPU)', 'Avançado (bar muscle-up, handstand walk)'], required: true },
  { order: 8, key: 'goal', question: 'Objetivo principal', type: 'SELECT', options: ['Competir no CrossFit', 'Melhorar WODs/benchmark', 'Ganhar força', 'Perder gordura', 'Saúde e disposição', 'Recomposição corporal'], required: true },
  { order: 9, key: 'benchmark_fran', question: 'Qual seu tempo no Fran (21-15-9 Thrusters 43kg/Pullups)?', type: 'TIME', placeholder: 'ex: 5:30', required: false, aiHint: 'Benchmark clássico do CrossFit' },
  { order: 10, key: 'sessions_per_week', question: 'Quantas sessões por semana você consegue treinar?', type: 'SELECT', options: ['3x', '4x', '5x', '6x', 'Todos os dias'], required: true },
  { order: 11, key: 'weight', question: 'Peso atual (kg)', type: 'NUMBER', required: true },
  { order: 12, key: 'height', question: 'Altura (cm)', type: 'NUMBER', required: false },
  { order: 13, key: 'injury_history', question: 'Já teve alguma lesão no CrossFit ou musculação?', type: 'TEXTAREA', required: false },
  { order: 14, key: 'medical_restrictions', question: 'Possui algum problema cardíaco ou restrição médica?', type: 'TEXTAREA', required: false },
  { order: 15, key: 'referral', question: 'Como soube da assessoria?', type: 'SELECT', options: ['WhatsApp (indicação)', 'Instagram', 'Google', 'Amigo', 'Outro'], required: false },
];

// ─── FITNESS / FUNCTIONAL ────────────────────────────────────────────────────

const FITNESS_QUESTIONS: NicheQuestionTemplate[] = [
  { order: 1, key: 'fitness_experience', question: 'Há quanto tempo você pratica atividade física regularmente?', type: 'SELECT', options: ['Estou começando', '< 1 ano', '1-3 anos', '3+ anos'], required: true },
  { order: 2, key: 'current_activities', question: 'Que atividades você pratica atualmente?', type: 'MULTISELECT', options: ['Musculação', 'Funcional', 'HIIT', 'Pilates', 'Yoga', 'Natação', 'Corrida', 'Ciclismo', 'Nenhuma'], required: true },
  { order: 3, key: 'goal', question: 'Objetivo principal', type: 'SELECT', options: ['Emagrecimento', 'Ganho de massa muscular', 'Condicionamento geral', 'Saúde e qualidade de vida', 'Preparação física para esporte', 'Reabilitação'], required: true },
  { order: 4, key: 'training_days', question: 'Quantos dias por semana você tem disponível para treinar?', type: 'SELECT', options: ['2', '3', '4', '5', '6'], required: true },
  { order: 5, key: 'session_duration', question: 'Quanto tempo por sessão você tem disponível?', type: 'SELECT', options: ['30 min', '45 min', '60 min', '90 min', 'Mais de 90 min'], required: true },
  { order: 6, key: 'training_location', question: 'Onde você prefere treinar?', type: 'SELECT', options: ['Academia', 'Em casa (com equipamentos)', 'Em casa (sem equipamentos)', 'Ao ar livre', 'Box/studio'], required: true },
  { order: 7, key: 'weight', question: 'Peso atual (kg)', type: 'NUMBER', required: true },
  { order: 8, key: 'height', question: 'Altura (cm)', type: 'NUMBER', required: true },
  { order: 9, key: 'injury_history', question: 'Já teve alguma lesão ou limitação física?', type: 'TEXTAREA', required: false },
  { order: 10, key: 'medical_restrictions', question: 'Possui algum problema cardíaco, diabetes ou restrição médica?', type: 'TEXTAREA', required: false },
  { order: 11, key: 'sleep_hours', question: 'Quantas horas de sono você dorme em média?', type: 'SELECT', options: ['< 5h', '5-6h', '6-7h', '7-8h', '8h+'], required: false },
  { order: 12, key: 'stress_level', question: 'Como avalia seu nível de estresse no dia a dia?', type: 'SCALE', required: false },
  { order: 13, key: 'referral', question: 'Como soube da assessoria?', type: 'SELECT', options: ['WhatsApp (indicação)', 'Instagram', 'Google', 'Amigo', 'Outro'], required: false },
];

// ─── NICHE ZONE CONFIGURATIONS ────────────────────────────────────────────────

const RUNNING_ZONES: NicheZoneConfig = {
  label: 'Zonas de Pace',
  unit: 'min/km',
  zones: [
    { name: 'Z1 - Recuperação', description: 'Pace muito fácil, conversa normal' },
    { name: 'Z2 - Base Aeróbica', description: 'Pace confortável, base de endurance' },
    { name: 'Z3 - Aeróbico', description: 'Esforço moderado, levemente ofegante' },
    { name: 'Z4 - Limiar', description: 'Pace de corrida forte, sustentável por 20-40min' },
    { name: 'Z5 - VO2max', description: 'Esforço máximo, intervalados curtos' },
  ],
};

const CYCLING_ZONES: NicheZoneConfig = {
  label: 'Zonas de Potência (FTP)',
  unit: 'watts / % FTP',
  zones: [
    { name: 'Z1 - Recuperação Ativa', description: '< 55% FTP — passeio leve', min: 0, max: 55 },
    { name: 'Z2 - Resistência', description: '56-75% FTP — base aeróbica', min: 56, max: 75 },
    { name: 'Z3 - Tempo', description: '76-90% FTP — esforço moderado-alto', min: 76, max: 90 },
    { name: 'Z4 - Limiar (FTP)', description: '91-105% FTP — ao redor do FTP', min: 91, max: 105 },
    { name: 'Z5 - VO2max', description: '106-120% FTP — muito intenso', min: 106, max: 120 },
    { name: 'Z6 - Anaeróbico', description: '121-150% FTP — sprints curtos', min: 121, max: 150 },
    { name: 'Z7 - Neuromuscular', description: '> 150% FTP — explosão máxima', min: 150, max: 999 },
  ],
};

const SWIMMING_ZONES: NicheZoneConfig = {
  label: 'Zonas de Natação (CSS)',
  unit: 'min/100m',
  zones: [
    { name: 'Z1 - Recuperação', description: '> 130% CSS — nado suave' },
    { name: 'Z2 - Base Aeróbica', description: '116-130% CSS — ritmo fácil' },
    { name: 'Z3 - Desenvolvimento', description: '101-115% CSS — esforço moderado' },
    { name: 'Z4 - Limiar (CSS)', description: '95-100% CSS — nado forte sustentável' },
    { name: 'Z5 - Alta Intensidade', description: '< 95% CSS — muito intenso, séries curtas' },
  ],
};

const TRIATHLON_ZONES: NicheZoneConfig = {
  label: 'Multi-Zonas (3 modalidades)',
  unit: 'varies',
  zones: [
    { name: 'Natação — CSS', description: 'Critical Swim Speed (100m)' },
    { name: 'Ciclismo — FTP', description: 'Functional Threshold Power (watts)' },
    { name: 'Corrida — Pace Limiar', description: 'min/km no limiar anaeróbio' },
    { name: 'Transição T1/T2', description: 'Ritmo de transição nadar→bike / bike→corrida' },
  ],
};

const CROSSFIT_ZONES: NicheZoneConfig = {
  label: 'Intensidades CrossFit',
  unit: 'RPE / % 1RM',
  zones: [
    { name: 'Low — < 65% 1RM', description: 'Volumes altos, movimentos técnicos' },
    { name: 'Moderate — 65-80% 1RM', description: 'Força e condicionamento' },
    { name: 'High — 80-90% 1RM', description: 'Força máxima, volume baixo' },
    { name: 'Max — > 90% 1RM', description: 'Teste de 1RM, intensidade máxima' },
    { name: 'WOD Intensity', description: 'AMRAP/For Time — ritmo sustentável e sprint' },
  ],
};

const FITNESS_ZONES: NicheZoneConfig = {
  label: 'Zonas Cardíacas',
  unit: '% FCmax',
  zones: [
    { name: 'Z1 - Aquecimento', description: '50-60% FCmax' },
    { name: 'Z2 - Queima de Gordura', description: '60-70% FCmax' },
    { name: 'Z3 - Aeróbico', description: '70-80% FCmax' },
    { name: 'Z4 - Anaeróbico', description: '80-90% FCmax' },
    { name: 'Z5 - Máximo', description: '90-100% FCmax' },
  ],
};

// ─── PRICING PER NICHE ────────────────────────────────────────────────────────

function buildPricing(monthly: number, label: string): NichePricing {
  return {
    monthly: {
      label: `Plano Mensal`,
      priceInCents: monthly,
      features: [`Assessoria ${label}`, 'Planilha personalizada', 'App dedicado', 'Chat com o coach', 'Análise de performance'],
    },
    quarterly: {
      label: `Plano Trimestral`,
      priceInCents: Math.round(monthly * 2.7), // ~10% off
      features: [`Tudo do mensal`, '10% de desconto', 'Revisão trimestral completa'],
    },
    annual: {
      label: `Plano Anual`,
      priceInCents: Math.round(monthly * 9.6), // ~20% off
      features: [`Tudo do trimestral`, '20% de desconto', 'Avaliação física anual', 'Suporte prioritário'],
    },
  };
}

// ─── MASTER NICHE CONFIG MAP ──────────────────────────────────────────────────

export const NICHE_CONFIGS: Record<SportNiche, NicheConfig> = {
  RUNNING: {
    key: SportNiche.RUNNING,
    label: 'Corrida',
    icon: '🏃',
    description: 'Assessoria de corrida de rua e trilha',
    color: '#3b82f6',
    primaryMetric: 'pace (min/km)',
    workoutTypes: ['Corrida Leve', 'Tempo Run', 'Intervalo', 'Longão', 'Recuperação', 'Prova'],
    zoneConfig: RUNNING_ZONES,
    questionTemplates: RUNNING_QUESTIONS,
    pricing: buildPricing(4990, 'Corrida'),
    integrations: ['Garmin', 'Strava', 'Apple Health', 'Polar', 'Coros'],
    features: ['Training Load ATL/CTL/TSB', 'VDOT Calculator', 'Zonas de Pace', 'Garmin Connect', 'PDF de Evolução'],
  },
  CYCLING: {
    key: SportNiche.CYCLING,
    label: 'Ciclismo',
    icon: '🚴',
    description: 'Assessoria de ciclismo de estrada e mountain bike',
    color: '#f59e0b',
    primaryMetric: 'potência (watts)',
    workoutTypes: ['Rodagem Leve', 'Tempo/FTP', 'Intervalos de Potência', 'Fundão', 'Escalada', 'Sprint'],
    zoneConfig: CYCLING_ZONES,
    questionTemplates: CYCLING_QUESTIONS,
    pricing: buildPricing(5990, 'Ciclismo'),
    integrations: ['Garmin', 'Strava', 'Wahoo', 'Zwift', 'TrainingPeaks'],
    features: ['FTP Calculator', 'Zonas de Potência (7 zonas)', 'CTL/ATL/TSB em watts', 'Zwift Integration', 'Análise de Potência'],
  },
  TRIATHLON: {
    key: SportNiche.TRIATHLON,
    label: 'Triathlon',
    icon: '🏊‍♂️🚴🏃',
    description: 'Assessoria completa para triatletas de todas as distâncias',
    color: '#8b5cf6',
    primaryMetric: 'multi-modalidade',
    workoutTypes: ['Natação Base', 'Natação Série', 'Bike Fundão', 'Bike FTP', 'Corrida Brick', 'Corrida Leve', 'Treino Combinado'],
    zoneConfig: TRIATHLON_ZONES,
    questionTemplates: TRIATHLON_QUESTIONS,
    pricing: buildPricing(7990, 'Triathlon'),
    integrations: ['Garmin', 'Strava', 'Wahoo', 'TrainingPeaks', 'Apple Health'],
    features: ['Plano Multi-modalidade', 'Zonas para 3 esportes', 'Análise de Transição', 'Periodização para prova'],
  },
  SWIMMING: {
    key: SportNiche.SWIMMING,
    label: 'Natação',
    icon: '🏊',
    description: 'Assessoria de natação em piscina e água aberta',
    color: '#06b6d4',
    primaryMetric: 'pace (min/100m)',
    workoutTypes: ['Aquecimento', 'Série Técnica', 'Série Aeróbica', 'Série de Intensidade', 'Resistência', 'Sprint'],
    zoneConfig: SWIMMING_ZONES,
    questionTemplates: SWIMMING_QUESTIONS,
    pricing: buildPricing(4490, 'Natação'),
    integrations: ['Garmin (aquático)', 'Apple Watch', 'Polar', 'Coros', 'Suunto'],
    features: ['CSS Calculator', 'Zonas por estilo', 'Planilha de piscina', 'Análise de splits por 50m'],
  },
  CROSSFIT: {
    key: SportNiche.CROSSFIT,
    label: 'CrossFit',
    icon: '🏋️',
    description: 'Assessoria de CrossFit e treinamento funcional de alta intensidade',
    color: '#ef4444',
    primaryMetric: 'desempenho em WODs',
    workoutTypes: ['WOD', 'Strength (Força)', 'EMOM', 'AMRAP', 'For Time', 'Skill Work', 'Recuperação Ativa'],
    zoneConfig: CROSSFIT_ZONES,
    questionTemplates: CROSSFIT_QUESTIONS,
    pricing: buildPricing(5490, 'CrossFit'),
    integrations: ['Garmin', 'Apple Health', 'MyFitnessPal', 'Beyond the Whiteboard'],
    features: ['Tracking de 1RM', 'Benchmarks CrossFit', 'Periodização para competição', 'Registro de WODs'],
  },
  FITNESS: {
    key: SportNiche.FITNESS,
    label: 'Fitness & Funcional',
    icon: '💪',
    description: 'Assessoria de fitness, musculação e treinamento funcional',
    color: '#10b981',
    primaryMetric: 'progressão de carga',
    workoutTypes: ['Treino A/B/C', 'Full Body', 'HIIT', 'Funcional', 'Cardio', 'Flexibilidade', 'Recuperação'],
    zoneConfig: FITNESS_ZONES,
    questionTemplates: FITNESS_QUESTIONS,
    pricing: buildPricing(3990, 'Fitness'),
    integrations: ['Garmin', 'Apple Health', 'Google Fit', 'MyFitnessPal'],
    features: ['Progressão de Carga', 'Zonas Cardíacas', 'Histórico de treinos', 'Acompanhamento nutricional'],
  },
  GENERAL: {
    key: SportNiche.GENERAL,
    label: 'Multiesportivo',
    icon: '🎯',
    description: 'Assessoria generalista para múltiplos esportes',
    color: '#6b7280',
    primaryMetric: 'variável por esporte',
    workoutTypes: ['Treino Personalizado', 'Cardio', 'Força', 'Flexibilidade', 'Técnica', 'Recuperação'],
    zoneConfig: FITNESS_ZONES,
    questionTemplates: FITNESS_QUESTIONS,
    pricing: buildPricing(4990, 'Multiesportivo'),
    integrations: ['Garmin', 'Strava', 'Apple Health', 'Polar', 'Coros'],
    features: ['Plano Personalizado', 'Múltiplas modalidades', 'Análise de performance'],
  },
};

export function getNicheConfig(niche: SportNiche): NicheConfig {
  return NICHE_CONFIGS[niche] ?? NICHE_CONFIGS[SportNiche.RUNNING];
}

export function calculateCyclingPowerZones(ftp: number) {
  return [
    { zone: 1, name: 'Recuperação', minWatts: 0, maxWatts: Math.round(ftp * 0.55) },
    { zone: 2, name: 'Resistência', minWatts: Math.round(ftp * 0.56), maxWatts: Math.round(ftp * 0.75) },
    { zone: 3, name: 'Tempo', minWatts: Math.round(ftp * 0.76), maxWatts: Math.round(ftp * 0.90) },
    { zone: 4, name: 'Limiar (FTP)', minWatts: Math.round(ftp * 0.91), maxWatts: Math.round(ftp * 1.05) },
    { zone: 5, name: 'VO2max', minWatts: Math.round(ftp * 1.06), maxWatts: Math.round(ftp * 1.20) },
    { zone: 6, name: 'Anaeróbico', minWatts: Math.round(ftp * 1.21), maxWatts: Math.round(ftp * 1.50) },
    { zone: 7, name: 'Neuromuscular', minWatts: Math.round(ftp * 1.51), maxWatts: 9999 },
  ];
}

export function calculateSwimCSS(best100m: number, best400m: number): number {
  // CSS = (400m time - 100m time) / 300 seconds per 100m
  const css = (best400m - best100m) / 3;
  return Math.round(css * 10) / 10; // seconds per 100m
}

export function calculateSwimZones(cssSeconds: number) {
  return [
    { zone: 1, name: 'Recuperação', pace: `> ${formatSwimPace(cssSeconds * 1.3)}` },
    { zone: 2, name: 'Base Aeróbica', pace: `${formatSwimPace(cssSeconds * 1.16)} – ${formatSwimPace(cssSeconds * 1.3)}` },
    { zone: 3, name: 'Desenvolvimento', pace: `${formatSwimPace(cssSeconds * 1.01)} – ${formatSwimPace(cssSeconds * 1.15)}` },
    { zone: 4, name: 'CSS (Limiar)', pace: `${formatSwimPace(cssSeconds * 0.95)} – ${formatSwimPace(cssSeconds * 1.0)}` },
    { zone: 5, name: 'Alta Intensidade', pace: `< ${formatSwimPace(cssSeconds * 0.95)}` },
  ];
}

function formatSwimPace(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}/100m`;
}
