import type { NextFunction, Request, Response } from "express";

export function mid_logger(content: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        console.log(content);
        next();
    }
}