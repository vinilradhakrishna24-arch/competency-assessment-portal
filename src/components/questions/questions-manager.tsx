'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Pencil, EyeOff, Eye, Trash2, Upload, ListTree, BookOpenCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/dialog';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants';
import { QuestionFormDialog, type EditableQuestion } from '@/components/questions/question-form-dialog';
import { QuestionSetsDialog } from '@/components/questions/question-sets-dialog';
import { getQuestions, setQuestionActive, deleteQuestion } from '@/lib/actions/questions';
import type { RoleName } from '@/types/database';

interface QuestionRow {
  id: string;
  competency_id: string;
  question_set_id: string | null;
  question_type: 'single' | 'multiple' | 'true_false';
  question_text: string;
  scenario_text: string | null;
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  explanation_admin_only: string | null;
  active: boolean;
  competencies: { code: string; competency_name: string } | null;
  question_sets: { set_name: string } | null;
  question_options: { id: string; option_key: string; option_text: string; is_correct: boolean; sort_order: number }[];
}

export function QuestionsManager({
  initialQuestions,
  competencies,
  questionSets,
  role,
}: {
  initialQuestions: QuestionRow[];
  competencies: { id: string; code: string; competency_name: string }[];
  questionSets: {
    id: string;
    competency_id: string;
    set_name: string;
    active: boolean;
    competencies: { code: string; competency_name: string } | null;
  }[];
  role: RoleName;
}) {
  const [questions, setQuestions] = React.useState(initialQuestions);
  const [competencyFilter, setCompetencyFilter] = React.useState('');
  const [setFilter, setSetFilter] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [setsOpen, setSetsOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EditableQuestion | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const canEdit = role === 'admin';

  async function refresh() {
    const data = await getQuestions({
      competencyId: competencyFilter || undefined,
      questionSetId: setFilter || undefined,
    });
    setQuestions(data as unknown as QuestionRow[]);
  }

  // Skip the first run — initialQuestions is already server-rendered; only
  // refetch once the user actually changes a filter.
  const didMountFilters = React.useRef(false);
  React.useEffect(() => {
    if (!didMountFilters.current) {
      didMountFilters.current = true;
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencyFilter, setFilter]);

  const availableSets = questionSets.filter((s) => !competencyFilter || s.competency_id === competencyFilter);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Select value={competencyFilter} onChange={(e) => { setCompetencyFilter(e.target.value); setSetFilter(''); }} className="w-auto">
            <option value="">All Competencies</option>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>{c.code}</option>
            ))}
          </Select>
          <Select value={setFilter} onChange={(e) => setSetFilter(e.target.value)} className="w-auto">
            <option value="">All Sets</option>
            {availableSets.map((s) => (
              <option key={s.id} value={s.id}>{s.set_name}</option>
            ))}
          </Select>
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSetsOpen(true)}>
              <ListTree className="h-4 w-4" /> Question Sets
            </Button>
            <Button variant="outline" asChild>
              <Link href="/questions/import">
                <Upload className="h-4 w-4" /> Bulk Import
              </Link>
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Question
            </Button>
          </div>
        )}
      </div>

      {questions.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No questions found"
          description="Add a question manually or use bulk import to populate the question bank."
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Competency</Th>
              <Th>Set</Th>
              <Th>Type</Th>
              <Th>Question</Th>
              <Th>Marks</Th>
              <Th>Difficulty</Th>
              <Th>Status</Th>
              {canEdit && <Th />}
            </Tr>
          </Thead>
          <Tbody>
            {questions.map((q) => (
              <Tr key={q.id}>
                <Td>{q.competencies && <CompetencyBadge code={q.competencies.code} />}</Td>
                <Td className="text-slate-500">{q.question_sets?.set_name ?? '—'}</Td>
                <Td className="text-slate-500">{QUESTION_TYPE_LABELS[q.question_type]}</Td>
                <Td className="max-w-sm truncate" title={q.question_text}>{q.question_text}</Td>
                <Td>{q.marks}</Td>
                <Td className="text-slate-500">{q.difficulty ? DIFFICULTY_LABELS[q.difficulty] : '—'}</Td>
                <Td>
                  <Badge className={q.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}>
                    {q.active ? 'Active' : 'Inactive'}
                  </Badge>
                </Td>
                {canEdit && (
                  <Td>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing({
                            id: q.id,
                            competency_id: q.competency_id,
                            question_set_id: q.question_set_id,
                            question_type: q.question_type,
                            question_text: q.question_text,
                            scenario_text: q.scenario_text,
                            marks: q.marks,
                            difficulty: q.difficulty,
                            explanation_admin_only: q.explanation_admin_only,
                            active: q.active,
                            options: [...q.question_options]
                              .sort((a, b) => a.sort_order - b.sort_order)
                              .map((o) => ({ option_key: o.option_key, option_text: o.option_text, is_correct: o.is_correct })),
                          });
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await setQuestionActive(q.id, !q.active);
                          toast.success(q.active ? 'Question deactivated' : 'Question activated');
                          refresh();
                        }}
                      >
                        {q.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingId(q.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <QuestionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        competencies={competencies}
        questionSets={questionSets}
        question={editing}
        onSaved={refresh}
      />
      <QuestionSetsDialog
        open={setsOpen}
        onOpenChange={setSetsOpen}
        competencies={competencies}
        questionSets={questionSets}
        onChanged={refresh}
      />
      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(o) => !o && setDeletingId(null)}
        title="Delete this question?"
        description="This permanently removes the question. Existing exams that already used it keep their own frozen snapshot and are not affected."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deletingId) return;
          await deleteQuestion(deletingId);
          toast.success('Question deleted');
          setDeletingId(null);
          refresh();
        }}
      />
    </div>
  );
}
