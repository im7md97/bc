import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { insertEntrySchema } from "@shared/schema";
import { useCreateEntry, useUpdateEntry } from "@/hooks/use-entries";
import { Loader2 } from "lucide-react";

const formSchema = insertEntrySchema;
type FormValues = z.infer<typeof formSchema>;

interface EntryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryToEdit?: { id: number } & FormValues | null;
}

export function EntryFormModal({ isOpen, onClose, entryToEdit }: EntryFormModalProps) {
  const isEditing = !!entryToEdit;
  
  const createMutation = useCreateEntry();
  const updateMutation = useUpdateEntry();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "pending",
    },
  });

  useEffect(() => {
    if (isOpen && entryToEdit) {
      form.reset({
        title: entryToEdit.title,
        description: entryToEdit.description,
        status: entryToEdit.status,
      });
    } else if (isOpen && !entryToEdit) {
      form.reset({
        title: "",
        description: "",
        status: "pending",
      });
    }
  }, [isOpen, entryToEdit, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEditing && entryToEdit) {
        await updateMutation.mutateAsync({ id: entryToEdit.id, ...values });
      } else {
        await createMutation.mutateAsync(values);
      }
      onClose();
    } catch (error) {
      // Error is handled by mutations and toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-2xl font-bold text-primary">
            {isEditing ? "تعديل السجل" : "إضافة سجل جديد"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEditing 
              ? "قم بتحديث بيانات السجل أدناه ثم اضغط حفظ." 
              : "أدخل بيانات السجل الجديد ليتم إضافته إلى النظام."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="text-right">
                  <FormLabel className="font-semibold text-foreground">العنوان</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="أدخل عنوان السجل..." 
                      className="bg-secondary/30 border-secondary focus:ring-primary/20" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="text-right">
                  <FormLabel className="font-semibold text-foreground">الوصف</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="أدخل تفاصيل وملاحظات السجل..." 
                      className="resize-none h-24 bg-secondary/30 border-secondary focus:ring-primary/20" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="text-right">
                  <FormLabel className="font-semibold text-foreground">الحالة</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} dir="rtl">
                    <FormControl>
                      <SelectTrigger className="bg-secondary/30 border-secondary">
                        <SelectValue placeholder="اختر الحالة" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pending">قيد الانتظار</SelectItem>
                      <SelectItem value="in-progress">جاري العمل</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4 border-t border-border/50">
              <Button 
                type="submit" 
                className="flex-1 hover-lift bg-primary text-primary-foreground font-bold"
                disabled={isPending}
              >
                {isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                {isEditing ? "حفظ التعديلات" : "إضافة السجل"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isPending}
                className="hover-lift"
              >
                إلغاء
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
