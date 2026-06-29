/**
 * Global type definitions for the Schul-Stat application.
 */

export interface School {
  snr: string;
  name: string;
  city: string;
  plz?: string;
  ort?: string;
  strasse?: string;
}

export interface Snapshot {
  snapId?: string;
  snapshotDate: string;
  schoolYear: number;
  termNo: number;
  info?: string;
  source?: string;
  termId?: number;
}

export interface KPIBreakdownItem {
  name: string;
  value: number;
}

export interface StudentTrendItem {
  termId?: number;
  termLabel?: string;
  snapshot_date: string;
  total_students: number;
  ef_students: number;
}

export interface SchoolStudentTrendItem {
  snr: string;
  schoolName: string;
  termId?: number;
  termLabel?: string;
  snapshot_date: string;
  total_students: number;
}

export interface SchoolGradeTrendItem {
  snr: string;
  schoolName: string;
  grade: string;
  total_students: number;
}

export interface OverviewData {
  totals: {
    totalStudents: number;
    specialNeeds: number;
    specialNeedsPercent: number;
  };
  genderBreakdown: KPIBreakdownItem[];
  gradeBreakdown: KPIBreakdownItem[];
  supportBreakdown: KPIBreakdownItem[];
  efBreakdown: KPIBreakdownItem[];
  religionBreakdown: KPIBreakdownItem[];
  migrationBreakdown: KPIBreakdownItem[];
  nationalityBreakdown: KPIBreakdownItem[];
  educationTrackBreakdown: KPIBreakdownItem[];
  hTrackGradeBreakdown: KPIBreakdownItem[];
  studentTrend: StudentTrendItem[];
  schoolStudentTrend: SchoolStudentTrendItem[];
  schoolGradeTrend?: SchoolGradeTrendItem[];
}

export interface TeacherData {
  schoolCount: number;
  totalTeachers: number;
  sexBreakdown: KPIBreakdownItem[];
  ageBreakdown: KPIBreakdownItem[];
  cityBreakdown: KPIBreakdownItem[];
  nationalityBreakdown: KPIBreakdownItem[];
}

export interface StudentStrengthRow {
  city: string;
  snr: string;
  name: string;
  snapshotDate: string;
  snapshotLabel?: string;
  students: number;
}

export interface ClassStrengthRow {
  city: string;
  snr: string;
  name: string;
  class_code: string;
  bemerkung?: string;
  students: number;
}

export interface DazRow {
  city: string;
  snr: string;
  name: string;
  class_code: string;
  bemerkung?: string;
  daz: number;
}

export interface User {
  user_id?: string | number;
  username: string;
  group_name: string;
  dashboards: string[];
  dashboard_permissions: Array<{
    dashboard_key: string;
    dashboard_name: string;
  }>;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ConnectionStatus {
  configured: boolean;
  host: string;
  port: number;
  database: string;
  username: string;
  defaults: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
  };
}

export interface ConnectionResponse {
  host: string;
  port: number;
  database: string;
}

export type AnmeldeStatus = "Vorbereitet" | "In Bearbeitung" | "Beendet";
export type Anmeldeverfahrenstyp = "GS" | "SEK1";

export interface Anmeldeverfahren {
  id: number;
  schuljahr: string;
  bezeichnung: string;
  verfahrenstyp: Anmeldeverfahrenstyp;
  status: AnmeldeStatus;
  sichtbar: boolean;
  arbeitsrunde_id: number | null;
  arbeitsrunde_nummer?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Anmelderunde {
  id: number;
  verfahren_id: number;
  runden_nummer: number;
  bezeichnung: string;
  startdatum: string | null;
  enddatum: string | null;
  status: AnmeldeStatus;
  ist_arbeitsrunde: boolean;
  created_at: string;
  updated_at: string;
}

export interface NextRoundTransitionResponse {
  message: string;
  created: boolean;
  copied_students: number;
  current_round: Anmelderunde;
  next_round: Anmelderunde;
}

export interface BeteiligteSchule {
  snr: string;
  name: string;
  ort: string;
  schulform: string;
  selected: boolean;
}
