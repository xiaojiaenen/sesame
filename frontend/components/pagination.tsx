"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, total, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4">
      <span className="text-sm text-muted-foreground">
        共 {total} 条记录，第 {page + 1}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="h-8 px-3"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          上一页
        </Button>
        {totalPages <= 7 ? (
          Array.from({ length: totalPages }, (_, i) => (
            <Button
              key={i}
              variant={i === page ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(i)}
              className="h-8 w-8 p-0"
            >
              {i + 1}
            </Button>
          ))
        ) : (
          <>
            {page > 2 && (
              <>
                <Button variant="outline" size="sm" onClick={() => onPageChange(0)} className="h-8 w-8 p-0">1</Button>
                {page > 3 && <span className="text-muted-foreground px-1">…</span>}
              </>
            )}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              if (p >= totalPages) return null;
              return (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(p)}
                  className="h-8 w-8 p-0"
                >
                  {p + 1}
                </Button>
              );
            })}
            {page < totalPages - 3 && (
              <>
                {page < totalPages - 4 && <span className="text-muted-foreground px-1">…</span>}
                <Button variant="outline" size="sm" onClick={() => onPageChange(totalPages - 1)} className="h-8 w-8 p-0">{totalPages}</Button>
              </>
            )}
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="h-8 px-3"
        >
          下一页
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
