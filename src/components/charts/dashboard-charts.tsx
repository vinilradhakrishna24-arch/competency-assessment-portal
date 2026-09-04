'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { DashboardData } from '@/lib/dashboard';

const COLORS = ['#0F5C4A', '#8A5A00', '#1E3A8A', '#64748B', '#B45309', '#0369A1'];
const PASS_FAIL_COLORS = ['#0F5C4A', '#C8102E'];
const BRAND_NAVY = '#0B1F3A';
const COMPETENT_GREEN = '#0F5C4A';

export function DashboardCharts({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Assessments by Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <Tooltip />
                <Bar dataKey="count" fill={BRAND_NAVY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pass vs Fail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.passVsFail} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {data.passVsFail.map((entry, index) => (
                    <Cell key={entry.name} fill={PASS_FAIL_COLORS[index % PASS_FAIL_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LOA / SFT / PTW Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.competencyDistribution} dataKey="value" nameKey="name" outerRadius={85} paddingAngle={2}>
                  {data.competencyDistribution.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pass Rate by Competency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.passRateByCompetency} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94A3B8" unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="#94A3B8" width={40} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="passRate" fill={BRAND_NAVY} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project-wise Competency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.projectWise}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94A3B8" interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="competent" name="Competent" fill={COMPETENT_GREEN} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Department-wise Competency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.departmentWise}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94A3B8" interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="competent" name="Competent" fill={COMPETENT_GREEN} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
