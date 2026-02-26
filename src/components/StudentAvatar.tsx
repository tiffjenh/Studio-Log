import type { Student } from "@/types";

/** Props for display-only avatar – gradient circle with initials. */
export interface StudentAvatarProps {
  student: Pick<Student, "firstName" | "lastName">;
  size?: number;
  /** "green" = homepage/dashboard green gradient; default = purple/pink. */
  variant?: "default" | "green";
}

export default function StudentAvatar({ student, size = 48, variant = "default" }: StudentAvatarProps) {
  const background = variant === "green" ? "var(--avatar-gradient-green)" : "var(--avatar-gradient)";
  return (
    <div
      style={{
        width: size,
        height: size,
        minWidth: size,
        maxWidth: size,
        minHeight: size,
        maxHeight: size,
        borderRadius: "50%",
        background,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: Math.max(12, Math.round(size * 0.33)),
        flexShrink: 0,
      }}
    >
      {student.firstName[0]}{student.lastName[0]}
    </div>
  );
}
