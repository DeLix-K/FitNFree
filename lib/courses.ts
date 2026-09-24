import { byNewest } from './library';
import { getIsPremium } from './subscription';
import { supabase } from './supabase';
import type { Course, CourseLesson, CourseLessonPreview, CourseWithStatus } from './types';

export async function fetchCourses(): Promise<CourseWithStatus[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const [coursesResult, previewsResult, enrollmentsResult, progressResult, isPremium] = await Promise.all([
    supabase.from('courses').select('*'),
    supabase.from('course_lesson_previews').select('*'),
    userId
      ? supabase.from('course_enrollments').select('course_id, status').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    userId
      ? supabase.from('course_lesson_progress').select('lesson_id').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    getIsPremium(),
  ]);

  if (coursesResult.error) throw new Error(coursesResult.error.message);
  if (previewsResult.error) throw new Error(previewsResult.error.message);

  const previews = (previewsResult.data ?? []) as CourseLessonPreview[];
  const lessonCountByCourse = new Map<string, number>();
  const courseIdByLesson = new Map<string, string>();
  for (const lesson of previews) {
    lessonCountByCourse.set(lesson.course_id, (lessonCountByCourse.get(lesson.course_id) ?? 0) + 1);
    courseIdByLesson.set(lesson.id, lesson.course_id);
  }

  // Bought before content moved into Premium -- those buyers keep access.
  const boughtCourseIds = new Set(
    (enrollmentsResult.data ?? [])
      .filter((e: { status: string }) => e.status === 'paid')
      .map((e: { course_id: string }) => e.course_id)
  );

  const completedCountByCourse = new Map<string, number>();
  for (const row of (progressResult.data ?? []) as { lesson_id: string }[]) {
    const courseId = courseIdByLesson.get(row.lesson_id);
    if (!courseId) continue;
    completedCountByCourse.set(courseId, (completedCountByCourse.get(courseId) ?? 0) + 1);
  }

  return ((coursesResult.data ?? []) as Course[]).sort(byNewest).map((course) => ({
    ...course,
    unlocked: course.is_free || isPremium || boughtCourseIds.has(course.id),
    lessonCount: lessonCountByCourse.get(course.id) ?? 0,
    completedCount: completedCountByCourse.get(course.id) ?? 0,
  }));
}

export async function fetchCourseLessons(
  courseId: string
): Promise<{ previews: CourseLessonPreview[]; fullById: Map<string, CourseLesson> }> {
  const [previewsResult, fullResult] = await Promise.all([
    supabase
      .from('course_lesson_previews')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true }),
    supabase.from('course_lessons').select('*').eq('course_id', courseId),
  ]);

  if (previewsResult.error) throw new Error(previewsResult.error.message);

  const fullById = new Map<string, CourseLesson>();
  for (const lesson of (fullResult.data ?? []) as CourseLesson[]) fullById.set(lesson.id, lesson);

  return { previews: (previewsResult.data ?? []) as CourseLessonPreview[], fullById };
}

export async function fetchCompletedLessonIds(): Promise<Set<string>> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return new Set();

  const { data, error } = await supabase
    .from('course_lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.lesson_id));
}

export async function markLessonComplete(lessonId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('course_lesson_progress')
    .upsert(
      { user_id: userId, lesson_id: lessonId },
      { onConflict: 'user_id,lesson_id', ignoreDuplicates: true }
    );

  if (error) throw new Error(error.message);
}

export async function markLessonIncomplete(lessonId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('course_lesson_progress')
    .delete()
    .eq('user_id', userId)
    .eq('lesson_id', lessonId);

  if (error) throw new Error(error.message);
}
