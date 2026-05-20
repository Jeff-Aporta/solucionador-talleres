export type Course = "ELECTRONICA" | "LENGUAJE-PROGRAMACION" | "INSOFT" | "FISICA";
export type WorkType = "FORO" | "TAREA" | "EVALUACION" | "SEGUIMIENTO" | "PROYECTO" | "TALLER";

export interface Work {
	slug: string;
	course: Course;
	type: WorkType;
	title: string;
	order: number;
	hasPdf?: boolean;
	student?: string;
	institution?: string;
}

export interface CourseInfo {
	key: Course;
	label: string;
	short: string;
	accent: string;
}

export const COURSES: CourseInfo[] = [
	{ key: "ELECTRONICA",          label: "Electrónica",            short: "ELEC", accent: "#3a8bff" },
	{ key: "LENGUAJE-PROGRAMACION", label: "Lenguaje de Programación", short: "LP",   accent: "#7c5cff" },
	{ key: "INSOFT",               label: "Ingeniería de Software",  short: "INSOFT", accent: "#22c55e" },
	{ key: "FISICA",               label: "Física",                  short: "FIS",    accent: "#f59e0b" },
];

export const TYPE_LABELS: Record<WorkType, string> = {
	FORO:         "Foro",
	TAREA:        "Tarea",
	EVALUACION:   "Evaluación",
	SEGUIMIENTO:  "Seguimiento",
	PROYECTO:     "Proyecto",
	TALLER:       "Taller",
};

export const WORKS: Work[] = [
	{ slug: "electronica-foro-2",   course: "ELECTRONICA",           type: "FORO",        title: "Foro 2",        order: 1 },
	{ slug: "electronica-foro-3",   course: "ELECTRONICA",           type: "FORO",        title: "Foro 3",        order: 2 },
	{ slug: "electronica-tarea-1",  course: "ELECTRONICA",           type: "TAREA",       title: "Tarea 1",       order: 3 },
	{ slug: "electronica-tarea-2",  course: "ELECTRONICA",           type: "TAREA",       title: "Tarea 2",       order: 4 },
	{ slug: "electronica-tarea-3",  course: "ELECTRONICA",           type: "TAREA",       title: "Tarea 3",       order: 5 },
	{ slug: "lp-evaluacion-1",      course: "LENGUAJE-PROGRAMACION", type: "EVALUACION",  title: "Evaluación 1",  order: 1 },
	{ slug: "lp-evaluacion-2",      course: "LENGUAJE-PROGRAMACION", type: "EVALUACION",  title: "Evaluación 2",  order: 2 },
	{ slug: "lp-seguimiento-1",     course: "LENGUAJE-PROGRAMACION", type: "SEGUIMIENTO", title: "Seguimiento 1", order: 3 },
	{ slug: "insoft-chat-app",      course: "INSOFT",                type: "PROYECTO",    title: "Chat App",      order: 1 },
	{ slug: "fisica-taller-maria",  course: "FISICA",                type: "TALLER",      title: "Taller de Recuperación 1° Periodo 2026", order: 1, hasPdf: false, student: "María José Hoyos Rodríguez", institution: "Institución Educativa CASD — Armenia, Quindío" },
];

export function worksByCourse(course: Course): Work[] {
	return WORKS.filter((w) => w.course === course).sort((a, b) => a.order - b.order);
}

export function findWork(slug: string): Work | undefined {
	return WORKS.find((w) => w.slug === slug);
}

export function assetBase(slug: string): string {
	return `/works/${slug}`;
}
