import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ImportWizard } from '@/components/questions/import/import-wizard';
import { requireAdmin } from '@/lib/auth/session';

export default async function QuestionImportPage() {
  await requireAdmin();

  return (
    <div>
      <PageHeader
        title="Bulk Import Questions"
        description="Upload an Excel or CSV file. Every row is validated before anything is saved — nothing is written until you confirm."
        actions={
          <Button variant="outline" asChild>
            <Link href="/questions">
              <ArrowLeft className="h-4 w-4" /> Back to Question Bank
            </Link>
          </Button>
        }
      />
      <ImportWizard />
    </div>
  );
}
